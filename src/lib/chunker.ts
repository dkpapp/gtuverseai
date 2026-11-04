export type Chunk = {id:string; chunkIndex:number; sectionHeading:string; content:string; tokenEstimate:number};
export function cleanMarkdown(raw:string):string {
 return raw.replace(/\r\n?/g,'\n').replace(/-\n(?=\w)/g,'').replace(/^[ \t]*Page\s+\d+\s+of\s+\d+[ \t]*$/gim,'').replace(/^[ \t]*(?:[-*_]\s*){3,}$/gm,'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'').replace(/\n{3,}/g,'\n\n').trim();
}
export function chunkMarkdownWithHeaders(markdown:string, docTitle:string):Chunk[] {
 const chunks:Chunk[]=[]; const headings:string[]=[]; let body=''; let heading='Introduction';
 const emit=()=>{if(!body.trim()) return; const content=`[Document: ${docTitle} | Section: ${heading}]\n${body.trim()}`; chunks.push({id:crypto.randomUUID(),chunkIndex:chunks.length,sectionHeading:heading,content,tokenEstimate:Math.ceil(content.length/4)});};
 const append=(text:string)=>{ while(text.length){ const room=3200-body.length; if(room<=0){emit(); body=body.slice(-450); continue;} if(text.length<=room){body+=(body?'\n\n':'')+text; break;} let cut=text.lastIndexOf(' ',room); if(cut<room/2) cut=room; body+=(body?'\n\n':'')+text.slice(0,cut); emit(); body=body.slice(-450); text=text.slice(cut).trimStart(); } };
 for(const block of cleanMarkdown(markdown).split(/\n(?=#{1,3}\s)|\n\s*\n/)) { const match=block.match(/^(#{1,3})\s+([^\n]+)(?:\n|$)/); if(match){emit(); body=''; headings.length=match[1].length-1; headings[match[1].length-1]=match[2].trim(); heading=headings.filter(Boolean).join(' > '); const rest=block.slice(match[0].length).trim(); if(rest) append(rest); } else if(block.trim()) append(block.trim()); } emit(); return chunks;
}
export function selectStratifiedChunks<T>(chunks:T[], maxChunks=8):T[] {if(maxChunks<=0)return []; if(chunks.length<=maxChunks)return chunks; return Array.from({length:maxChunks},(_,i)=>chunks[Math.floor(i*chunks.length/maxChunks)]);}
