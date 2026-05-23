/* ── Shared admin panel types ── */

export interface User {
  id: string;
  username: string;
  email: string;
  password?: string;
  role: 'admin' | 'teacher' | 'student';
  [key: string]: unknown;
}

export interface Course {
  courseId?: string;
  id?: string;
  name: string;
  teacherId?: string;
  degreeLevel?: string;
  semester?: string;
  studentIds?: string[];
  studentList?: Array<{ studentId: string; [key: string]: unknown }>;
  assignments?: Assignment[];
  [key: string]: unknown;
}

export interface Assignment {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  rubric?: Record<string, number>;
  [key: string]: unknown;
}

export interface CourseFormData {
  courseId: string;
  name: string;
  teacherId: string;
  degreeLevel: string;
  semester: string;
  studentIds: string[];
}

export interface AssignmentFormData {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  rubricText: string;
}

export interface ModalState {
  isOpen: boolean;
  isEditMode: boolean;
}

export interface FormData {
  id: string;
  username: string;
  email: string;
  password: string;
  role: string;
}

export interface ConfirmConfig {
  isOpen: boolean;
  title: string;
  text: string;
  onConfirm: (() => void) | null;
}

export type AdminMode = 'users' | 'relations' | 'llm-monitor' | 'api-keys' | 'staff-codes' | 'rag-eval';