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
