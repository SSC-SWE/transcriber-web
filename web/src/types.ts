// Mirrors the server's types (server/src/types.ts).

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export type AudioLanguage = 'auto' | 'yue' | 'zh' | 'en';
export type OutputLanguage = 'zh-HK' | 'zh-CN' | 'en';
export type SummaryStyle = 'lesson' | 'minutes';
export type SummaryLength = 'brief' | 'standard' | 'in-depth';

export interface QuizQuestion {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface Quiz {
  title: string;
  description: string;
  questions: QuizQuestion[];
  formURL: string | null;
  formEditURL: string | null;
}

export interface Session {
  id: string;
  filename: string;
  createdAt: string;
  audioLanguage: AudioLanguage;
  outputLanguage: OutputLanguage;
  audioFile: string;
  segments: TranscriptSegment[];
  summaryMarkdown: string | null;
  quiz: Quiz | null;
}

export interface SessionSummary {
  id: string;
  filename: string;
  createdAt: string;
  duration: number;
  segmentCount: number;
  hasSummary: boolean;
  hasQuiz: boolean;
}

export interface Job {
  id: string;
  sessionId: string;
  kind: 'transcribe' | 'summary' | 'quiz';
  stage: string;
  progress: number | null;
  error: string | null;
  done: boolean;
  createdAt: string;
}

export interface GoogleStatus {
  configured: boolean;
  signedIn: boolean;
  email: string | null;
}

export const AUDIO_LANGUAGES: { value: AudioLanguage; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'yue', label: 'Cantonese 粵語' },
  { value: 'zh', label: 'Mandarin 普通話' },
  { value: 'en', label: 'English' },
];

export const OUTPUT_LANGUAGES: { value: OutputLanguage; label: string }[] = [
  { value: 'zh-HK', label: '繁體中文（香港）' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
];
