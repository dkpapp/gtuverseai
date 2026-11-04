interface Env {
  AI: Ai;
  DB: D1Database;
  MATERIALS_BUCKET: R2Bucket;
  VECTOR_INDEX: VectorizeIndex;
  QUIZ_WORKFLOW: Workflow;
  AI_GATEWAY_ID: string;
  MAX_UPLOAD_MB: string;
  GOOGLE_AI_STUDIO_API_KEY?: string;
  GROQ_API_KEY?: string;
}
