/* ── Auth & Session ─────────────────────────────────────── */

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
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
}

export interface Assignment {
  id: string;
  title: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  status?: string;
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
}

/* ── Grading ───────────────────────────────────────────── */

export interface RubricItem {
  criterion: string;
  maxScore: number;
  score?: number;
  comment?: string;
}

export interface ScorePayload {
  submissionId?: string;
  rubric_scores?: RubricItem[];
  rubricScores?: Record<string, number>;
  total_score?: number;
  totalScore?: number;
  comment?: string;
  overallFeedback?: string;
}

/* ── AI / RAG ──────────────────────────────────────────── */

export interface AIAnalyzeResponse {}

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
  course_id?: string;
  doc_name: string;
  score: number;
  text: string;
  source_type?: 'local' | 'web';
  url?: string;
}

export interface UIElement {
  type: 'image' | 'file' | 'choice' | 'diagram';
  url?: string;
  alt?: string;
  options?: string[];
  message?: string;
  file_name?: string;
}

export interface ToolProgress {
  name: string;
  status: 'running' | 'done' | 'error';
  message?: string;
  result?: unknown;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  attachedText?: string;
  files?: { file_name: string; mime_type: string }[];
  citations?: RagCitation[];
  is_course_relevant?: boolean;
  images?: string[];
  ui_elements?: UIElement[];
  tool_progresses?: ToolProgress[];
}

/* ── AI Session ────────────────────────────────────────── */

export interface AISession {
  id: string;
  title: string;
  messages: ChatMessage[];
  _needFetch?: boolean;
  historyStart?: number;
  messageCount?: number;
  hasMoreMessages?: boolean;
  previewMessages?: ChatMessage[];
}

export interface AISessionListResponse {
  sessions: AISession[];
}

export interface AIMemory {}

/* ── Gmail / Email ─────────────────────────────────────── */

export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
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

export interface EmailClassification {}

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
  markdown?: string;
  question_drafts?: QuestionDraft[];
  history_id?: string;
  task_id?: string;
  source_kind?: string;
  error?: string;
}

export interface QuestionDraft {
  id: string;
  stem: string;
  options: string[];
  answer: string;
  explanation: string;
  raw_markdown: string;
}

export interface GenerationHistoryItem {
  id: string;
  tool?: string;
  tool_key?: string;
  created_at?: string;
  preview?: string;
  params?: Record<string, any>;
  result?: any;
  source?: Record<string, any>;
  slides_detail?: {
    request_id?: string;
    workflow?: Record<string, unknown> | null;
    source_artifacts?: Record<string, unknown>;
    result_artifacts?: Record<string, unknown>;
    result_data?: unknown;
  };
}

export interface QuestionHistoryDetail extends GenerationHistoryItem {
  result_data?: {
    markdown?: string;
    questions?: QuestionDraft[];
    selected_question_ids?: string[];
    finalized?: boolean;
  };
  result_markdown?: string;
  question_drafts?: QuestionDraft[];
  selected_question_ids?: string[];
}

/* ── Sub4 / Diagram Tool ───────────────────────────────── */

export interface Sub4ExtractState {
  file: File | null;
  loading: boolean;
  data: unknown;
  error: string;
  isDragging: boolean;
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
