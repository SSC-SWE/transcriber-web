import type {
  AudioLanguage,
  GoogleStatus,
  Job,
  OutputLanguage,
  Session,
  SessionSummary,
  SummaryLength,
  SummaryStyle,
  TranscriptLanguage,
} from './types';

/** Server origin, overridable at build time (VITE_API_BASE) when the server is hosted apart from the site. */
const API_BASE: string = import.meta.env.VITE_API_BASE ?? '';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, init);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body.error === 'string') message = body.error;
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export interface Health {
  ok: boolean;
  model: string;
  sttModel: string;
  hasApiKey: boolean;
  google: GoogleStatus;
}

export const getHealth = (): Promise<Health> => request<Health>('/api/health');

export async function listSessions(): Promise<SessionSummary[]> {
  const data = await request<{ sessions: SessionSummary[] }>('/api/sessions');
  return data.sessions;
}

export async function getSession(id: string): Promise<Session> {
  const data = await request<{ session: Session }>(`/api/sessions/${id}`);
  return data.session;
}

export function createSession(
  file: File,
  params: {
    audioLanguage: AudioLanguage;
    transcriptLanguage: TranscriptLanguage;
    outputLanguage: OutputLanguage;
    summaryStyle: SummaryStyle;
    quizCount: number;
  },
): Promise<{ session: Session; job: Job }> {
  const form = new FormData();
  form.append('file', file);
  form.append('audioLanguage', params.audioLanguage);
  form.append('transcriptLanguage', params.transcriptLanguage);
  form.append('outputLanguage', params.outputLanguage);
  form.append('summaryStyle', params.summaryStyle);
  form.append('quizCount', String(params.quizCount));
  return request('/api/sessions', { method: 'POST', body: form });
}

export async function renameSession(id: string, filename: string): Promise<Session> {
  const data = await request<{ session: Session }>(`/api/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename }),
  });
  return data.session;
}

export const deleteSession = (id: string): Promise<{ ok: boolean }> =>
  request(`/api/sessions/${id}`, { method: 'DELETE' });

export async function retranscribe(id: string): Promise<Job> {
  const data = await request<{ job: Job }>(`/api/sessions/${id}/transcribe`, { method: 'POST' });
  return data.job;
}

export async function summarize(id: string, length: SummaryLength): Promise<Job> {
  const data = await request<{ job: Job }>(`/api/sessions/${id}/summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ length }),
  });
  return data.job;
}

export async function generateQuiz(id: string): Promise<Job> {
  const data = await request<{ job: Job }>(`/api/sessions/${id}/quiz`, { method: 'POST' });
  return data.job;
}

export async function getJob(id: string): Promise<Job> {
  const data = await request<{ job: Job }>(`/api/jobs/${id}`);
  return data.job;
}

export function exportUrl(id: string, kind: 'transcript' | 'summary', format: 'docx' | 'txt'): string {
  return `${API_BASE}/api/sessions/${id}/export/${kind}?format=${format}`;
}

export const googleStatus = (): Promise<GoogleStatus> => request<GoogleStatus>('/api/google/status');

export const googleLoginUrl = (): string => `${API_BASE}/api/google/login`;

export const googleLogout = (): Promise<{ ok: boolean }> =>
  request('/api/google/logout', { method: 'POST' });
