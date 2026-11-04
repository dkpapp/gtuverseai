import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { all, first } from '../lib/db';
import { chunkMarkdownWithHeaders, selectStratifiedChunks, type Chunk } from '../lib/chunker';
import { generateStructuredJSON } from '../lib/llm-router';
import { QuizGenerationResultSchema, VerificationResultSchema, GeneratedMCQSchema } from '../lib/schema';
export type QuizWorkflowPayload={quizId:string;documentId:string;questionCount:number;difficulty:string;topicFocus?:string;remedialChunkIds?:string[]};
type DocumentRow={id:string;file_name:string;r2_object_key:string;mime_type:string;status:string};
type ChunkRow={id:string;chunk_index:number;section_heading:string;content:string;token_estimate:number};
const toChunk=(c:ChunkRow):Chunk=>({id:c.id,chunkIndex:c.chunk_index,sectionHeading:c.section_heading,content:c.content,tokenEstimate:c.token_estimate});
export class QuizGenerationWorkflow extends WorkflowEntrypoint<Env, QuizWorkflowPayload> {
 async run(event:WorkflowEvent<QuizWorkflowPayload>, step:WorkflowStep) {
  const p=event.payload, db=this.env.DB;
  const status=async(s:string)=>{await db.prepare('UPDATE quizzes SET workflow_step = ? WHERE id = ?').bind(s,p.quizId).run();};
  try {
   await step.do('parse-and-index',async()=>{
    const doc=await first<DocumentRow>(db,'SELECT * FROM documents WHERE id = ?',p.documentId); if(!doc) throw Error('Document not found');
    const existing=await first<{n:number}>(db,'SELECT COUNT(*) as n FROM document_chunks WHERE document_id = ?',p.documentId);
    if(doc.status==='READY' && existing?.n) return;
    await status('PARSING'); const obj=await this.env.MATERIALS_BUCKET.get(doc.r2_object_key); if(!obj) throw Error('Source file not found');
    const blob=await obj.blob(); let markdown='';
    if(/\.(txt|md)$/i.test(doc.file_name)) markdown=await blob.text();
    else { const result=await this.env.AI.toMarkdown([{name:doc.file_name,blob}]); const item=result[0]; if(item?.format==='markdown') markdown=item.data; }
    if((markdown.match(/[a-z0-9]/gi)||[]).length<150 && this.env.GOOGLE_AI_STUDIO_API_KEY){
     const bytes=new Uint8Array(await blob.arrayBuffer()); let binary=''; for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
     const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':this.env.GOOGLE_AI_STUDIO_API_KEY},body:JSON.stringify({contents:[{parts:[{text:'Transcribe all text, headings, tables, and mathematical equations (in LaTeX) from this document into clean Markdown.'},{inline_data:{mime_type:doc.mime_type,data:btoa(binary)}}]}]})}); if(!response.ok) throw Error(`OCR failed: ${response.status}`); const data=await response.json() as {candidates?:{content?:{parts?:{text?:string}[]}}[]}; markdown=data.candidates?.[0]?.content?.parts?.[0]?.text??'';
    }
    if(!markdown.trim()) throw Error('No text could be extracted from this file');
    await status('CHUNKING'); const chunks=chunkMarkdownWithHeaders(markdown,doc.file_name); if(!chunks.length)throw Error('No content found');
    const ai=this.env.AI as unknown as {run:(model:string,input:unknown)=>Promise<{data:number[][]}>};
    for(let i=0;i<chunks.length;i+=16){const batch=chunks.slice(i,i+16); const embeddings=await ai.run('@cf/baai/bge-m3',{text:batch.map(c=>c.content)}); if(embeddings.data?.length!==batch.length)throw Error('Embedding count mismatch'); await this.env.VECTOR_INDEX.upsert(batch.map((c,j)=>({id:c.id,values:embeddings.data[j],metadata:{document_id:p.documentId,chunk_id:c.id,section:c.sectionHeading}})));}
    await db.batch([db.prepare('DELETE FROM document_chunks WHERE document_id = ?').bind(p.documentId),...chunks.map(c=>db.prepare('INSERT INTO document_chunks (id,document_id,chunk_index,section_heading,content,token_estimate) VALUES (?,?,?,?,?,?)').bind(c.id,p.documentId,c.chunkIndex,c.sectionHeading,c.content,c.tokenEstimate)),db.prepare("UPDATE documents SET status='READY', total_chunks=?, error_message=NULL WHERE id=?").bind(chunks.length,p.documentId)]);
   });
   const selected=await step.do('retrieve-relevant-chunks',async()=>{await status('GENERATING'); const rows=await all<ChunkRow>(db,'SELECT * FROM document_chunks WHERE document_id = ? ORDER BY chunk_index',p.documentId); let chunks=rows.map(toChunk); if(p.remedialChunkIds?.length){const ids=new Set(p.remedialChunkIds); chunks=chunks.filter(c=>ids.has(c.id));} else if(p.topicFocus?.trim()){const ai=this.env.AI as unknown as {run:(model:string,input:unknown)=>Promise<{data:number[][]}>}; const embedding=await ai.run('@cf/baai/bge-m3',{text:[p.topicFocus]}); const result=await this.env.VECTOR_INDEX.query(embedding.data[0],{topK:8,filter:{document_id:p.documentId},returnMetadata:true}); const ids=new Set(result.matches.map(m=>m.id)); chunks=chunks.filter(c=>ids.has(c.id));} else chunks=selectStratifiedChunks(chunks); if(!chunks.length)throw Error('No matching source material found'); return chunks;});
   const generated=await step.do('generate-mcqs',async()=>generateStructuredJSON(this.env,{system:'You are an expert educator. Write self-contained questions answerable only from the supplied source. Cite the exact source_chunk_id and verbatim source_quote. Distribute Bloom levels. Use four distinct options A-D with plausible misconceptions, similar length and grammar; never use all or none of the above. Format mathematics with $ or $$ LaTeX delimiters.',prompt:`Create exactly ${p.questionCount} ${p.difficulty} questions. Topic: ${p.topicFocus||'all topics'}. Sources: ${JSON.stringify(selected)}`,schema:QuizGenerationResultSchema}));
   await step.do('verify-and-persist',async()=>{await status('VERIFYING'); const questions=generated.data.questions; if(questions.length!==p.questionCount) throw Error('Model returned the wrong number of questions'); for(const q of questions){const source=selected.find(c=>c.id===q.source_chunk_id); if(!source||!source.content.includes(q.source_quote)) throw Error('A question has an invalid source citation');}
    const review=await generateStructuredJSON(this.env,{system:'Audit each question against the source for a single unambiguous correct answer. Return a review for every zero-based question index, correcting the answer and explanation where necessary.',prompt:JSON.stringify({sources:selected,questions}),schema:VerificationResultSchema});
    if(review.data.reviews.length!==questions.length||new Set(review.data.reviews.map(r=>r.question_index)).size!==questions.length)throw Error('Incomplete verification');
    const verified=questions.map((q,i)=>{const r=review.data.reviews.find(x=>x.question_index===i); if(!r||!r.is_valid_and_unambiguous)throw Error('Verifier rejected a question'); return GeneratedMCQSchema.parse({...q,correct_option_id:r.corrected_option_id,stem:r.improved_stem||q.stem,explanation:r.improved_explanation||q.explanation});});
    await db.batch([...verified.map((q,i)=>db.prepare('INSERT INTO questions (id,quiz_id,question_order,bloom_level,difficulty,stem,options_json,correct_option_id,explanation,source_quote,source_chunk_id,verified) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)').bind(crypto.randomUUID(),p.quizId,i,q.bloom_level,q.difficulty,q.stem,JSON.stringify(q.options),q.correct_option_id,q.explanation,q.source_quote,q.source_chunk_id)),db.prepare("UPDATE quizzes SET status='COMPLETED',workflow_step='COMPLETED',title=?,model_used=? WHERE id=?").bind(generated.data.quiz_title,generated.modelUsed,p.quizId)]);
   });
  } catch(error){const message=error instanceof Error?error.message:String(error); await db.prepare("UPDATE quizzes SET status='FAILED', workflow_step='FAILED', error_message=? WHERE id=?").bind(message.slice(0,1000),p.quizId).run(); await db.prepare("UPDATE documents SET status='FAILED', error_message=? WHERE id=? AND status != 'READY'").bind(message.slice(0,1000),p.documentId).run(); throw error;}
 }
}
