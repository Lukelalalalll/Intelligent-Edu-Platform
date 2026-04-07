/* ── Auth & Session ─────────────────────────────────────── */

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
  [key: string]: unknown;
}

export interface SessionResponse {
  user: User;
}

/* ── Course / Assignment / Submission (teacher + student) ── */

export interface Course {
  _id?: string;
  id?: string;
  course_id?: string;
  name: string;
  [key: string]: unknown;
}

export interface Assignment {
  id: string;
  title: string;
  [key: string]: unknown;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  status?: string;
  [key: string]: unknown;
}

export interface SubmissionDetail extends Submission {
  pdfUrl?: string;
  annotations?: Annotation[];
  score?: number;
}

export interface Annotation {
  id: string;
  content: string;
  position: { x: number; y: number; width: number; height: number; pageNumber: number };
  [key: string]: unknown;
}

/* ── Grading ───────────────────────────────────────────── */

export interface RubricItem {
  criterion: string;
  maxScore: number;
  score?: number;
  comment?: string;
}

export interface ScorePayload {
  rubric_scores?: RubricItem[];
  rubricScores?: Record<string, number>;
  total_score?: number;
  totalScore?: number;
  comment?: string;
  overallFeedback?: string;
}

/* ── AI / RAG ──────────────────────────────────────────── */

export interface AIAnalyzeResponse {
  [key: string]: unknown;
}

export interface RAGDebugPayload {
  submissionId: string;
  selectedText: string;
  useRag?: boolean;
  ragTopK?: number;
}

export interface FeedbackPayload {
  submissionId: string;
  selectedText: string;
  assignment?: string;
  rubric?: Record<string, unknown>;
  messages?: ChatMessage[];
  useRag?: boolean;
  ragTopK?: number;
}

export interface RagCitation {
  index: number;
  course_id: string;
  doc_name: string;
  score: number;
  text: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: RagCitation[];
}

/* ── AI Session ────────────────────────────────────────── */

export interface AISession {
  id: string;
  title: string;
  messages: ChatMessage[];
  _needFetch?: boolean;
}

export interface AISessionListResponse {
  sessions: AISession[];
}

export interface AIMemory {
  [key: string]: unknown;
}

/* ── Gmail / Email ─────────────────────────────────────── */

export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  [key: string]: unknown;
}

export interface EmailDetail extends EmailSummary {
  bodyHtml?: string;
  bodyText?: string;
  threadId?: string;
  messageIdHeader?: string;
}

export interface EmailListResponse {
  emails: EmailSummary[];
  nextPageToken?: string | null;
}

export interface EmailClassification {
  [key: string]: unknown;
}

/* ── Sub2 / Question Generator ─────────────────────────── */

export interface Sub2UploadResponse {
  success: boolean;
  filename: string;
  file_type: string;
  task_id: string;
  total_pages?: number;
  error?: string;
}

export interface Sub2ExtractPayload {
  task_id: string;
  page_numbers: number[];
  prompt: string;
}

export interface Exercise {
  text: string;
  formattedText?: string;
  [key: string]: unknown;
}

export interface Sub2ExtractResponse {
  success: boolean;
  data?: {
    result?: {
      llm_json?: {
        exercises?: Exercise[];
      };
    };
  };
  text?: string;
  error?: string;
}

export interface Sub2GeneratePayload {
  task_id: string | null;
  subject: string;
  question_type: string;
  num_questions: number;
  difficulty: number;
  constraints: string[];
  output_language: string;
  question_basis: string | null;
  knowledge_points: string;
  saved_screenshots: string[];
}

export interface Sub2GenerateResponse {
  success: boolean;
  questions?: unknown;
  error?: string;
}

export interface GenerationHistoryItem {
  id: string;
  [key: string]: unknown;
}

/* ── Sub4 / Diagram Tool ───────────────────────────────── */

export interface Sub4ExtractState {
  file: File | null;
  isDragging: boolean;
  loading: boolean;
  data: unknown;
  error: string;
}

export interface Sub4SearchState {
  query: string;
  setQuery: (v: string) => void;
  loading: boolean;
  results: unknown;
  error: string;
}

/* ── Sub5 / Study Notes ────────────────────────────────── */

export interface Flashcard {
  front: string;
  back: string;
}

export interface NotesResponse {
  success: boolean;
  notes: string;
}

export interface FlashcardsResponse {
  success: boolean;
  flashcards: Flashcard[];
}

/* ── Common UI ─────────────────────────────────────────── */

export interface Toast {
  id: number;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

/* ── Generic API Error ─────────────────────────────────── */

export interface ApiErrorShape {
  detail?: string | Array<{ loc: string[]; msg: string }>;
  error?: string;
  message?: string;
}
