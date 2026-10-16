import type {
  AudioLanguage,
  GoogleStatus,
  Job,
  OutputLanguage,
  Session,
  SessionSummary,
  SummaryLength,
  SummaryStyle,
} from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
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
  audioLanguage: AudioLanguage,
  outputLanguage: OutputLanguage,
): Promise<{ session: Session; job: Job }> {
  const form = new FormData();
  form.append('file', file);
  form.append('audioLanguage', audioLanguage);
  form.append('outputLanguage', outputLanguage);
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

export async function summarize(
  id: string,
  style: SummaryStyle,
  length: SummaryLength,
): Promise<Job> {
  const data = await request<{ job: Job }>(`/api/sessions/${id}/summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ style, length }),
  });
  return data.job;
}

export async function generateQuiz(id: string, count: number): Promise<Job> {
  const data = await request<{ job: Job }>(`/api/sessions/${id}/quiz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  });
  return data.job;
}

export async function getJob(id: string): Promise<Job> {
  const data = await request<{ job: Job }>(`/api/jobs/${id}`);
  return data.job;
}

export const audioUrl = (id: string): string => `/api/sessions/${id}/audio`;

export function exportUrl(id: string, kind: 'transcript' | 'summary', format: 'docx' | 'txt'): string {
  return `/api/sessions/${id}/export/${kind}?format=${format}`;
}

export const googleStatus = (): Promise<GoogleStatus> => request<GoogleStatus>('/api/google/status');

export const googleLogout = (): Promise<{ ok: boolean }> =>
  request('/api/google/logout', { method: 'POST' });
