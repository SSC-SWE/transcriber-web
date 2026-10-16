// Session persistence: one JSON file per session under data/sessions, with the
// audio copied into data/uploads. Mirrors the mac app's LessonStore (which
// writes one JSON file per lesson under Application Support). Jobs are tracked
// in memory only — a restart drops in-flight jobs, and the client re-uploads.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import type {
  Job,
  JobKind,
  OutputLanguage,
  Session,
  SessionSummary,
  TranscriptSegment,
} from './types';

export const allowedAudioExtensions = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'mp4'];

// ---------------------------------------------------------------------------
// Timestamps / transcript text (port of the mac app's Lesson helpers)
// ---------------------------------------------------------------------------

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${h}:${pad(mm)}:${pad(s)}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function transcriptText(segments: TranscriptSegment[]): string {
  return segments.map((seg) => `[${formatTimestamp(seg.start)}] ${seg.text}`).join('\n');
}

/** Sanitised ASCII-ish base for exported file names (port of exportBase). */
export function exportBase(filename: string): string {
  const display = filename.replace(/\.[^.]+$/, '');
  const allowed = [...display].filter((ch) => /[A-Za-z0-9_\- ]/.test(ch)).join('');
  const name = allowed.trim();
  return name || 'session';
}

function newId(): string {
  return crypto.randomBytes(6).toString('hex');
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const sessions = new Map<string, Session>();

function sessionPath(id: string): string {
  return path.join(config.sessionsDir, `${id}.json`);
}

export function loadAll(): void {
  if (!fs.existsSync(config.sessionsDir)) return;
  for (const file of fs.readdirSync(config.sessionsDir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(config.sessionsDir, file), 'utf8')) as Session;
      sessions.set(parsed.id, parsed);
    } catch {
      // Skip corrupt files rather than crash on startup.
    }
  }
}

export function listSessions(): SessionSummary[] {
  return [...sessions.values()]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((s) => ({
      id: s.id,
      filename: s.filename,
      createdAt: s.createdAt,
      duration: s.segments.length ? s.segments[s.segments.length - 1].end : 0,
      segmentCount: s.segments.length,
      hasSummary: !!s.summaryMarkdown,
      hasQuiz: !!s.quiz,
    }));
}

export function getSession(id: string): Session | null {
  return sessions.get(id) ?? null;
}

export function createSession(params: {
  filename: string;
  audioLanguage: Session['audioLanguage'];
  outputLanguage: OutputLanguage;
  audioFile: string;
}): Session {
  const session: Session = {
    id: newId(),
    filename: params.filename,
    createdAt: new Date().toISOString(),
    audioLanguage: params.audioLanguage,
    outputLanguage: params.outputLanguage,
    audioFile: params.audioFile,
    segments: [],
    summaryMarkdown: null,
    quiz: null,
  };
  sessions.set(session.id, session);
  persist(session);
  return session;
}

export function saveSession(session: Session): void {
  sessions.set(session.id, session);
  persist(session);
}

export function renameSession(id: string, filename: string): Session | null {
  const session = sessions.get(id);
  if (!session) return null;
  session.filename = filename;
  persist(session);
  return session;
}

export function deleteSession(id: string): void {
  const session = sessions.get(id);
  sessions.delete(id);
  const p = sessionPath(id);
  if (fs.existsSync(p)) fs.rmSync(p);
  if (session) {
    const audio = path.join(config.uploadsDir, session.audioFile);
    if (fs.existsSync(audio)) fs.rmSync(audio);
  }
}

export function audioPath(session: Session): string {
  return path.join(config.uploadsDir, session.audioFile);
}

function persist(session: Session): void {
  fs.writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2));
}

// ---------------------------------------------------------------------------
// Jobs (in-memory)
// ---------------------------------------------------------------------------

const jobs = new Map<string, Job>();

export function createJob(sessionId: string, kind: JobKind, stage: string): Job {
  const job: Job = {
    id: newId(),
    sessionId,
    kind,
    stage,
    progress: null,
    error: null,
    done: false,
    createdAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | null {
  return jobs.get(id) ?? null;
}

export function updateJob(id: string, patch: Partial<Pick<Job, 'stage' | 'progress' | 'error' | 'done'>>): void {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch);
}

export function jobJson(job: Job): Job {
  return { ...job };
}
