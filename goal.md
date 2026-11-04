# `goal.md` — Autonomous AI Agent Build Specification for **GTUverse (`gtuverse.com`)**

## 0. Agent Mission & Operating Directives

You are an autonomous Principal Full-Stack & NLP Engineer tasked with building **GTUverse (`gtuverse.com`)** from scratch to production readiness.

**Core Product Goal:**  
Build a 100% Cloudflare-native, AI-enabled learning platform capable of ingesting single uploaded learning materials (`.pdf`, `.docx`, `.pptx`, `.md`, `.txt`, `.png`, `.jpg`), parsing and segmenting the content via Natural Language Processing (NLP), and generating pedagogically rigorous, validated Multiple Choice Question (MCQ) quizzes with source citations, $\LaTeX$ math rendering, and adaptive weak-topic remediation.

### Non-Negotiable Architectural Rules for the Agent
1. **Zero External Paid Servers:** Everything must run on Cloudflare's serverless edge (`@opennextjs/cloudflare` for Next.js App Router + Cloudflare Workers, Cloudflare Workflows, D1 SQLite, R2 Object Storage, Vectorize v2, Workers AI, and AI Gateway).
2. **No Mock or Placeholder Logic:** Every route, database query, chunking algorithm, vector embedding call, and LLM structured-output parser must be fully implemented. Never leave `// TODO` comments.
3. **Zero-Cost Multi-Provider Free LLM Routing:** Implement a resilient fallback chain using free-tier LLM providers:
   - **Primary:** Google Gemini (`gemini-3.8-flash` / `gemini-2.5-flash` via Google AI Studio API or Cloudflare AI Gateway)
   - **Secondary Fallback:** Groq Cloud Free Tier (`openai/gpt-oss-120b` / `llama-3.3-70b-versatile`)
   - **Tertiary Native Edge Fallback:** Cloudflare Workers AI (`@cf/google/gemma-4-26b-a4b-it` and `@cf/zai-org/glm-4.7-flash`)
   - **Embeddings Model:** Cloudflare Workers AI `@cf/baai/bge-m3` ($1024$ dimensions)
4. **Strict Structured Outputs:** Every LLM response that creates or verifies MCQs must be strictly validated against a `Zod` JSON Schema before touching the database.
5. **Deduplication First:** Compute the `SHA-256` hash of every uploaded file before running document parsing. If the hash already exists in Cloudflare D1 with `status = 'READY'`, skip R2 upload, parsing, and embedding, and immediately reuse the existing document chunks.

---

## 1. Target Repository File Tree

Create and maintain this exact project structure:

~~~text
gtuverse/
├── migrations/
│   └── 0001_initial_schema.sql          # Complete D1 SQLite schema & indexes
├── src/
│   ├── app/
│   │   ├── layout.tsx                   # Root layout with KaTeX CSS & dark/light theme
│   │   ├── page.tsx                     # Landing page + Upload & Quiz Configuration Wizard
│   │   ├── dashboard/
│   │   │   └── page.tsx                 # User's uploaded documents, past quizzes & analytics
│   │   ├── quiz/
│   │   │   └── [quizId]/
│   │   │       ├── page.tsx             # Live workflow status poller + Interactive Quiz Player
│   │   │       └── results/
│   │   │           └── [attemptId]/
│   │   │               └── page.tsx     # Score breakdown, source quotes & Remedial Quiz button
│   │   └── api/
│   │       ├── upload/
│   │       │   └── route.ts             # POST: SHA-256 check, R2 upload, D1 insert, trigger Workflow
│   │       └── quizzes/
│   │           └── [quizId]/
│   │               ├── route.ts         # GET: Fetch quiz + questions + status
│   │               ├── attempt/
│   │               │   └── route.ts     # POST: Grade quiz attempt & save analytics
│   │               └── remediate/
│   │                   └── route.ts     # POST: Generate targeted follow-up quiz from missed chunks
│   ├── components/
│   │   ├── UploadWizard.tsx             # Drag-and-drop file uploader + client SHA-256 + config form
│   │   ├── WorkflowStatusPoller.tsx     # Real-time step progress UI while NLP pipeline runs
│   │   ├── QuizPlayer.tsx               # Practice Mode & Exam Mode MCQ player with timer & palette
│   │   ├── LatexText.tsx                # Renders inline ($...$) and block ($$...$$) LaTeX via KaTeX
│   │   └── SourceDrawer.tsx             # Slide-over showing verbatim source quote & page reference
│   ├── lib/
│   │   ├── db.ts                        # D1 typed helper queries
│   │   ├── hash.ts                      # Web Crypto SHA-256 buffer utility
│   │   ├── chunker.ts                   # Header-preserving semantic Markdown chunker & sampler
│   │   ├── schema.ts                    # Zod schemas for MCQ generation, Verification & API payloads
│   │   └── llm-router.ts                # Multi-provider Free LLM Router (Gemini -> Groq -> Workers AI)
│   └── workflows/
│       └── quiz-workflow.ts             # Cloudflare Workflow: Parse -> Chunk -> Embed -> Generate -> Verify
├── cloudflare-env.d.ts                  # TypeScript definitions for Cloudflare bindings
├── next.config.ts                       # Next.js config integrated with OpenNext Cloudflare
├── open-next.config.ts                  # OpenNext Cloudflare adapter config
├── wrangler.jsonc                       # Cloudflare Workers, D1, R2, Vectorize, AI & Workflow bindings
├── package.json
└── tsconfig.json
~~~

---

## 2. Infrastructure & Bindings Specification

### 2.1 `wrangler.jsonc`
Configure all Cloudflare resources in `wrangler.jsonc`:

~~~jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "gtuverse",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat"],
  "routes": [
    { "pattern": "gtuverse.com", "custom_domain": true },
    { "pattern": "www.gtuverse.com", "custom_domain": true }
  ],
  "ai": {
    "binding": "AI"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "gtuverse-db",
      "database_id": "00000000-0000-0000-0000-000000000000",
      "migrations_dir": "migrations"
    }
  ],
  "r2_buckets": [
    {
      "binding": "MATERIALS_BUCKET",
      "bucket_name": "gtuverse-materials"
    }
  ],
  "vectorize": [
    {
      "binding": "VECTOR_INDEX",
      "index_name": "gtuverse-index"
    }
  ],
  "workflows": [
    {
      "name": "quiz-generation-workflow",
      "binding": "QUIZ_WORKFLOW",
      "class_name": "QuizGenerationWorkflow"
    }
  ],
  "vars": {
    "AI_GATEWAY_ID": "gtuverse-ai-gateway",
    "MAX_UPLOAD_MB": "25"
  }
}
~~~

### 2.2 `cloudflare-env.d.ts`
Define strict TypeScript types for `Env`:

~~~typescript
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
~~~

---

## 3. Database Schema (`migrations/0001_initial_schema.sql`)

Create `migrations/0001_initial_schema.sql` with the following exact tables and indexes:

~~~sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    display_name TEXT NOT NULL DEFAULT 'GTU Scholar',
    branch TEXT,
    semester INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    r2_object_key TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    total_chunks INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PROCESSING', -- 'PROCESSING' | 'READY' | 'FAILED'
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON documents(file_hash, status);

CREATE TABLE IF NOT EXISTS document_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    section_heading TEXT NOT NULL,
    content TEXT NOT NULL,
    token_estimate INTEGER NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id, chunk_index);

CREATE TABLE IF NOT EXISTS quizzes (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    topic_focus TEXT,
    difficulty TEXT NOT NULL, -- 'Easy' | 'Medium' | 'Hard' | 'Mixed'
    mode TEXT NOT NULL DEFAULT 'PRACTICE', -- 'PRACTICE' | 'EXAM'
    question_count INTEGER NOT NULL,
    model_used TEXT,
    workflow_step TEXT NOT NULL DEFAULT 'QUEUED', -- 'QUEUED' | 'PARSING' | 'CHUNKING' | 'GENERATING' | 'VERIFYING' | 'COMPLETED' | 'FAILED'
    status TEXT NOT NULL DEFAULT 'GENERATING', -- 'GENERATING' | 'COMPLETED' | 'FAILED'
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    quiz_id TEXT NOT NULL,
    question_order INTEGER NOT NULL,
    bloom_level TEXT NOT NULL, -- 'Recall' | 'Understand' | 'Apply' | 'Analyze' | 'Evaluate'
    difficulty TEXT NOT NULL,
    stem TEXT NOT NULL,
    options_json TEXT NOT NULL, -- JSON array of { id: 'A'|'B'|'C'|'D', text: string }
    correct_option_id TEXT NOT NULL, -- 'A' | 'B' | 'C' | 'D'
    explanation TEXT NOT NULL,
    source_quote TEXT NOT NULL,
    source_chunk_id TEXT,
    verified INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_questions_quiz_id ON questions(quiz_id, question_order);

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id TEXT PRIMARY KEY,
    quiz_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    accuracy_percent REAL NOT NULL,
    time_taken_seconds INTEGER NOT NULL,
    answers_json TEXT NOT NULL, -- JSON record: { [questionId]: { selected: 'A', isCorrect: boolean } }
    weak_chunk_ids_json TEXT NOT NULL, -- JSON array of source_chunk_id strings missed by the user
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);
~~~

---

## 4. Core NLP & Data Modules Specification

### 4.1 Strict Zod Schemas (`src/lib/schema.ts`)
Implement the following schemas for LLM structured outputs and API validation:

1. **`MCQOptionSchema`**:
   - `id`: `z.enum(["A", "B", "C", "D"])`
   - `text`: `z.string().min(1)`
2. **`GeneratedMCQSchema`**:
   - `bloom_level`: `z.enum(["Recall", "Understand", "Apply", "Analyze", "Evaluate"])`
   - `difficulty`: `z.enum(["Easy", "Medium", "Hard"])`
   - `stem`: `z.string().min(15)`
   - `options`: `z.array(MCQOptionSchema).length(4)`
   - `correct_option_id`: `z.enum(["A", "B", "C", "D"])`
   - `explanation`: `z.string().min(20)`
   - `source_quote`: `z.string().min(10)`
   - `source_chunk_id`: `z.string()`
3. **`QuizGenerationResultSchema`**:
   - `quiz_title`: `z.string().min(5)`
   - `questions`: `z.array(GeneratedMCQSchema)`
4. **`VerificationResultSchema`** (for the 2-Pass Self-Critique Verifier):
   - `reviews`: array of objects containing:
     - `question_index`: `z.number()`
     - `is_valid_and_unambiguous`: `z.boolean()`
     - `corrected_option_id`: `z.enum(["A", "B", "C", "D"])`
     - `improved_stem`: `z.string().optional()`
     - `improved_explanation`: `z.string().optional()`

### 4.2 Header-Preserving Semantic Chunker (`src/lib/chunker.ts`)
Write a pure TypeScript module with zero native binary dependencies:

1. **`cleanMarkdown(raw: string): string`**:
   - Strip repeating page numbers (e.g., `Page 1 of 20`), excessive horizontal rules, broken hyphenation across newlines (`-\n`), and control characters.
2. **`chunkMarkdownWithHeaders(markdown: string, docTitle: string)`**:
   - Track active Markdown headings (`#`, `##`, `###`) as a breadcrumb path (e.g., `"Unit 3: Deadlocks > 3.2 Banker's Algorithm"`).
   - Split text along paragraph and list boundaries so each chunk is approximately $700\text{ to }850\text{ tokens}$ ($\approx 2800\text{ to }3400\text{ characters}$) with a $15\%$ overlap ($\approx 450\text{ characters}$) from the preceding chunk.
   - Prepend `[Document: ${docTitle} | Section: ${currentHeading}]\n` to each chunk's content so the LLM always knows the structural hierarchy.
   - Return an array of `{ id: string, chunkIndex: number, sectionHeading: string, content: string, tokenEstimate: number }`.
3. **`selectStratifiedChunks(chunks, maxChunks = 8)`**:
   - If `chunks.length <= maxChunks`, return all chunks.
   - Otherwise, select `maxChunks` evenly spaced across the array using stride calculation $i \times \frac{\text{chunks.length}}{\text{maxChunks}}$ so the generated quiz covers the entire document uniformly.

### 4.3 Multi-Provider Free LLM Router (`src/lib/llm-router.ts`)
Implement `generateStructuredJSON<T>(env: Env, options: { system: string; prompt: string; schema: z.ZodType<T>; temperature?: number }): Promise<{ data: T; modelUsed: string }>`:

Execute a resilient 3-tier waterfall:
1. **Tier 1 — Google Gemini (`gemini-3.8-flash` / `gemini-2.5-flash`):**
   - If `env.GOOGLE_AI_STUDIO_API_KEY` is present, call the Google Generative Language REST API (or route via Cloudflare AI Gateway URL) with `generationConfig: { responseMimeType: "application/json", responseSchema: ... }`.
2. **Tier 2 — Groq LPU (`openai/gpt-oss-120b`):**
   - If Tier 1 throws an error or HTTP `429` rate limit and `env.GROQ_API_KEY` is present, call Groq's OpenAI-compatible chat completions endpoint with `response_format: { type: "json_object" }` and strict schema instructions.
3. **Tier 3 — Cloudflare Workers AI Native Binding (`env.AI.run`):**
   - Guaranteed zero-key fallback using `await env.AI.run("@cf/google/gemma-4-26b-a4b-it", { messages, response_format: { type: "json_schema", json_schema: ... } })`, with secondary fallback to `@cf/zai-org/glm-4.7-flash`.
4. Parse the returned JSON through `options.schema.parse(parsedJson)`. If validation fails, retry once with the Zod validation error appended to the prompt.

---

## 5. Durable NLP Pipeline (`src/workflows/quiz-workflow.ts`)

Implement `QuizGenerationWorkflow` extending `WorkflowEntrypoint<Env, QuizWorkflowPayload>`. Every step must update `quizzes.workflow_step` in D1 so the frontend can display real-time progress.

### Step 1: `parse-document` (Updates `workflow_step = 'PARSING'`)
- Check if `documents.status === 'READY'` and chunks already exist in `document_chunks` for `documentId` (from SHA-256 deduplication). If yes, skip straight to Step 3!
- Otherwise, fetch the file from `env.MATERIALS_BUCKET.get(r2ObjectKey)`.
- Convert the file into Markdown using `await env.AI.toMarkdown([{ name: fileName, blob: await r2Object.blob() }])`.
- **OCR Vision Fallback for Scanned PDFs/Images:** If the extracted Markdown contains fewer than $150$ alphanumeric characters and `env.GOOGLE_AI_STUDIO_API_KEY` is configured, send the inline base64 file data to `gemini-3.8-flash` with the prompt: *"Transcribe all text, headings, tables, and mathematical equations (in LaTeX) from this document into clean Markdown."*

### Step 2: `chunk-and-index` (Updates `workflow_step = 'CHUNKING'`)
- Clean and segment the Markdown using `chunkMarkdownWithHeaders()`.
- Insert all chunks into `document_chunks` using `env.DB.batch()`, and update `documents` to `status = 'READY'`, `total_chunks = chunks.length`.
- Generate vector embeddings in batches using `await env.AI.run("@cf/baai/bge-m3", { text: chunks.map(c => c.content) })`.
- Upsert the vectors into `env.VECTOR_INDEX` with metadata `{ document_id: documentId, chunk_id: chunk.id, section: chunk.sectionHeading }`.

### Step 3: `retrieve-relevant-chunks` (Updates `workflow_step = 'GENERATING'`)
- **If `payload.remedialChunkIds` is provided:** Fetch those exact chunks from `document_chunks` in D1.
- **Else if `payload.topicFocus` is provided and non-empty:** Embed `payload.topicFocus` using `@cf/baai/bge-m3`, query `env.VECTOR_INDEX` with filter `{ document_id: documentId }` and `topK: 8`, and fetch the matching chunks from D1.
- **Else:** Fetch all chunks for `documentId` from D1 and run `selectStratifiedChunks(chunks, 8)`.

### Step 4: `generate-mcqs-with-llm`
- Construct the pedagogical system prompt:
  - Enforce that every question stem is self-contained and verifiable strictly from the provided chunks.
  - Require each question to cite the exact `source_chunk_id` and a verbatim `source_quote`.
  - Distribute cognitive difficulty across Bloom's Taxonomy (`Recall`, `Understand`, `Apply`, `Analyze`, `Evaluate`).
  - Enforce distractor quality: all 4 options (`A`, `B`, `C`, `D`) must be similar in length and grammatical form; distractors must target realistic misconceptions; **strictly forbid** *"All of the above"* or *"None of the above"*.
  - Format all math/chemistry/physics variables and equations using `$...$` for inline $\LaTeX$ and `$$...$$` for display $\LaTeX$.
- Call `generateStructuredJSON()` with `QuizGenerationResultSchema`.

### Step 5: `verify-and-persist` (Updates `workflow_step = 'VERIFYING'` $\rightarrow$ `'COMPLETED'`)
- Run a second LLM verification pass (`VerificationResultSchema`) that audits the generated questions against the source chunks to confirm there is only one unambiguously correct option and the `correct_option_id` matches the `explanation`.
- Apply any corrections from the verifier.
- Batch-insert the verified questions into the `questions` table in D1 and update `quizzes` with `status = 'COMPLETED'`, `workflow_step = 'COMPLETED'`, `title = result.quiz_title`, and `model_used = modelUsed`.

---

## 6. Backend API Endpoints Specification

1. **`POST /api/upload` (`src/app/api/upload/route.ts`)**
   - Accepts `multipart/form-data` with fields: `file`, `questionCount` ($5\text{ to }30$), `difficulty` (`Easy`, `Medium`, `Hard`, `Mixed`), `mode` (`PRACTICE`, `EXAM`), `topicFocus` (optional string), and `clientFileHash` (optional SHA-256 hex).
   - Validates file size ($\le 25\text{ MB}$) and allowed extensions (`.pdf`, `.docx`, `.pptx`, `.txt`, `.md`, `.png`, `.jpg`).
   - Computes server-side `SHA-256` hash via `src/lib/hash.ts`.
   - Queries D1 `SELECT id, r2_object_key, status FROM documents WHERE file_hash = ? AND status = 'READY' LIMIT 1`.
   - If not found, uploads file buffer to `env.MATERIALS_BUCKET.put(r2Key, buffer)` and inserts a new row into `documents`.
   - Inserts a new row into `quizzes` with `status = 'GENERATING'` and triggers `await env.QUIZ_WORKFLOW.create({ id: quizId, params: ... })`.
   - Returns `{ quizId, documentId, deduplicated: boolean }`.

2. **`GET /api/quizzes/[quizId]` (`src/app/api/quizzes/[quizId]/route.ts`)**
   - Fetches the quiz metadata from `quizzes`.
   - If `status === 'COMPLETED'`, also queries all rows from `questions WHERE quiz_id = ? ORDER BY question_order ASC` and parses `options_json`.
   - Returns `{ quiz, questions }`.

3. **`POST /api/quizzes/[quizId]/attempt` (`src/app/api/quizzes/[quizId]/attempt/route.ts`)**
   - Accepts `{ answers: Record<string, "A" | "B" | "C" | "D">, timeTakenSeconds: number }`.
   - Loads the quiz's questions from D1, calculates `score`, `accuracy_percent`, and collects the `source_chunk_id` of every question answered incorrectly into `weakChunkIds`.
   - Inserts a new record into `quiz_attempts` and returns `{ attemptId, score, totalQuestions, accuracyPercent, weakChunkIds }`.

4. **`POST /api/quizzes/[quizId]/remediate` (`src/app/api/quizzes/[quizId]/remediate/route.ts`)**
   - Accepts `{ attemptId: string, questionCount?: number }`.
   - Reads `weak_chunk_ids_json` from `quiz_attempts`.
   - Creates a new remedial quiz record in `quizzes` linked to the same `document_id` and triggers `QUIZ_WORKFLOW` passing `remedialChunkIds` so the new quiz exclusively tests the concepts the student missed.
   - Returns `{ newQuizId }`.

---

## 7. Frontend UI/UX Specification

Design a fast, responsive, dark-mode-friendly interface tailored for university and engineering students (`gtuverse.com`):

1. **`UploadWizard.tsx` (Home Page):**
   - Drag-and-drop zone supporting PDF, DOCX, PPTX, Markdown, and images of handwritten notes.
   - Computes client-side `SHA-256` hash immediately on file drop and displays a badge ("File fingerprinted for instant cache lookup").
   - Configuration controls:
     - **Number of Questions:** Slider or segmented pills ($5$, $10$, $15$, $20$, $30$).
     - **Difficulty Level:** `Easy`, `Medium`, `Hard`, `Mixed (Bloom's Balanced)`.
     - **Quiz Mode:** `Practice Mode` (instant answer feedback + source citations after each question) vs. `Exam Mode` (countdown timer, question navigation palette, results revealed on submit).
     - **Topic Focus (Optional):** Input box (e.g., *"Focus on Laplace Transforms"* or *"Unit 4: Deadlock Prevention"*).

2. **`WorkflowStatusPoller.tsx` (`/quiz/[quizId]` while `status === 'GENERATING'`):**
   - Polls `GET /api/quizzes/[quizId]` every $2\text{ seconds}$.
   - Renders an animated 5-stage vertical stepper reflecting `quiz.workflow_step`:
     1. `PARSING`: Extracting Markdown & Formulas at the Edge
     2. `CHUNKING`: Semantic Header Segmentation & Vector Indexing
     3. `GENERATING`: Synthesizing Bloom's Taxonomy MCQs & Distractors
     4. `VERIFYING`: Running 2-Pass Answer Key & Hallucination Audit
     5. `COMPLETED`: Launching Interactive Quiz Player

3. **`QuizPlayer.tsx` (`/quiz/[quizId]` when `status === 'COMPLETED'`):**
   - Displays badges for the current question's **Bloom Level** (e.g., `Apply`, `Analyze`) and **Difficulty**.
   - Renders question stems, options, and explanations through `<LatexText text={...} />` using `katex` so formulas like $\mathcal{L}\{f(t)\} = F(s)$ render natively.
   - **In Practice Mode:** Clicking an option locks the question, highlights the correct option in emerald green and any wrong selection in rose red, displays the full pedagogical `explanation`, and reveals a **"Verify in Source Material"** button that opens `SourceDrawer.tsx` showing the verbatim `source_quote` and section heading.
   - **In Exam Mode:** Shows a top countdown timer ($90\text{ seconds}$ per question), a sidebar question navigator grid (Answered, Flagged for Review, Unvisited), and submits all answers at once to `POST /api/quizzes/[quizId]/attempt`.

4. **Results & Analytics Page (`/quiz/[quizId]/results/[attemptId]`):**
   - Displays score card, accuracy percentage, time spent, and a breakdown of performance by **Bloom's Taxonomy level** (e.g., Recall: $100\%$, Apply: $60\%$).
   - Lists all questions with the user's selected answer, the correct option, full explanation, and verbatim source quote.
   - Features a prominent **"Generate Adaptive Remedial Quiz on Missed Concepts"** button that triggers `POST /api/quizzes/[quizId]/remediate` and redirects to the new targeted quiz.

---

## 8. Autonomous Agent Execution Plan & Verification Protocol

Execute these phases sequentially. Do not proceed to the next phase until the verification command for the current phase succeeds with zero errors.

### Phase 1: Project Initialization & Dependencies
1. Initialize the Next.js + Cloudflare OpenNext project if not already initialized.
2. Install required packages:
   ~~~bash
   npm install zod katex lucide-react clsx tailwind-merge
   npm install -D @types/katex wrangler @opennextjs/cloudflare
   ~~~
3. Create `wrangler.jsonc`, `cloudflare-env.d.ts`, and `migrations/0001_initial_schema.sql`.
4. Apply the D1 schema locally and verify tables exist:
   ~~~bash
   npx wrangler d1 migrations apply gtuverse-db --local
   ~~~

### Phase 2: Core NLP Library & Workflow Implementation
1. Implement `src/lib/hash.ts`, `src/lib/schema.ts`, `src/lib/chunker.ts`, `src/lib/db.ts`, and `src/lib/llm-router.ts`.
2. Implement `src/workflows/quiz-workflow.ts` and ensure `QuizGenerationWorkflow` is exported from the worker entrypoint so Cloudflare Workflows binds to it cleanly.
3. Verify TypeScript compilation across all backend modules:
   ~~~bash
   npx tsc --noEmit
   ~~~

### Phase 3: API Routes & Frontend Components
1. Implement all 4 API routes under `src/app/api/`.
2. Implement `LatexText.tsx`, `SourceDrawer.tsx`, `UploadWizard.tsx`, `WorkflowStatusPoller.tsx`, and `QuizPlayer.tsx`.
3. Implement the pages: `src/app/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/quiz/[quizId]/page.tsx`, and `src/app/quiz/[quizId]/results/[attemptId]/page.tsx`.

### Phase 4: Build & Self-Verification Checklist (Definition of Done)
Run the following verification checks and fix any issues before reporting completion:
- [ ] `npx tsc --noEmit` passes with $0$ TypeScript errors.
- [ ] `npm run build` completes cleanly with all Next.js routes and API handlers compiled.
- [ ] Every LLM call enforces `QuizGenerationResultSchema` or `VerificationResultSchema` via Zod.
- [ ] Uploading the same file twice reuses the existing `documents` and `document_chunks` records via `file_hash` deduplication.
- [ ] Mathematical notation in stems, options, and explanations renders cleanly via `LatexText.tsx`.