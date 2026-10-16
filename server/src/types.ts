// Domain types shared by the server and mirrored by the web client.

/** One timestamped transcript line (seconds), matching the mac app's
 *  TranscriptSegment and the `{start, end, text}` the STT provider returns. */
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export type AudioLanguage = 'auto' | 'yue' | 'zh' | 'en';
export type OutputLanguage = 'zh-HK' | 'zh-CN' | 'en';
export type SummaryStyle = 'lesson' | 'minutes';
export type SummaryLength = 'brief' | 'standard' | 'in-depth';

/** Language the transcript is shown in: the original audio, or translated. */
export type TranscriptLanguage = 'original' | OutputLanguage;

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

/** A saved session: the uploaded audio plus everything produced from it. */
export interface Session {
  id: string;
  filename: string;
  createdAt: string;
  audioLanguage: AudioLanguage;
  outputLanguage: OutputLanguage;
  /** Audio file name inside the data dir (copied in on import; deleted after transcription). */
  audioFile: string;
  segments: TranscriptSegment[];
  /** Transcript language: the original audio, or a translation target. */
  transcriptLanguage: TranscriptLanguage;
  /** Translated copy of `segments` (same timestamps), when transcriptLanguage != 'original'. */
  segmentsTranslated: TranscriptSegment[] | null;
  summaryMarkdown: string | null;
  quiz: Quiz | null;
}

/** Lightweight row for the sidebar list. */
export interface SessionSummary {
  id: string;
  filename: string;
  createdAt: string;
  duration: number;
  segmentCount: number;
  hasSummary: boolean;
  hasQuiz: boolean;
}

/** A background job (transcription / summary / quiz generation). */
export type JobKind = 'transcribe' | 'summary' | 'quiz';

export interface Job {
  id: string;
  sessionId: string;
  kind: JobKind;
  stage: string;
  /** 0–100, or null while indeterminate. */
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
