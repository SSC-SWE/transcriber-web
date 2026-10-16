// Express server: REST API + (in production) the built web app.
//
// The OpenRouter and Google keys never leave this process — the browser only
// ever talks to /api. Transcription is a background job (STT can take minutes
// on long recordings); the client polls GET /api/jobs/:id.

import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { config, ensureDataDirs } from './config';
import { buildDocx } from './docx';
import * as google from './google';
import * as openrouter from './openrouter';
import { s2t } from './s2t';
import {
  allowedAudioExtensions,
  audioPath,
  createJob,
  createSession,
  deleteSession,
  exportBase,
  formatTimestamp,
  getJob,
  getSession,
  jobJson,
  listSessions,
  loadAll,
  renameSession,
  saveSession,
  transcriptText,
  updateJob,
} from './store';
import type { Job, OutputLanguage, Session, SummaryLength, SummaryStyle, TranscriptLanguage } from './types';

ensureDataDirs();
loadAll();
// Audio is never stored — clear any uploads left behind by a previous run
// (e.g. a process that was killed mid-transcription).
for (const file of fs.readdirSync(config.uploadsDir)) {
  try {
    fs.rmSync(path.join(config.uploadsDir, file), { force: true });
  } catch {
    // ignore
  }
}

const app = express();
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Uploads (multer → temp name; renamed after the session id is known)
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploadsDir),
    filename: (_req, _file, cb) => cb(null, `tmp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`),
  }),
  limits: { fileSize: 512 * 1024 * 1024 },
});

function decodeName(name: string): string {
  // multer keeps original names in latin1; recover UTF-8 for non-ASCII names.
  return Buffer.from(name, 'latin1').toString('utf8');
}

// ---------------------------------------------------------------------------
// Background jobs
// ---------------------------------------------------------------------------

function audioFormatFor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || 'wav';
  return ext === 'mp4' ? 'mp4' : ext;
}

async function runTranscription(session: Session, job: Job): Promise<void> {
  const file = audioPath(session);
  let data: Buffer;
  try {
    data = fs.readFileSync(file);
  } catch {
    updateJob(job.id, { stage: 'Failed', error: 'The uploaded audio is no longer available — re-upload.', done: true });
    return;
  } finally {
    // Audio is transient: it exists only long enough to be transcribed, never
    // stored. Delete it the moment it has been read into memory.
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // already gone
    }
  }
  try {
    updateJob(job.id, { stage: 'Transcribing…', progress: null });
    const result = await openrouter.transcribe(
      data,
      audioFormatFor(session.audioFile),
      session.audioLanguage,
    );
    let segments = result.segments;
    if (session.outputLanguage === 'zh-HK') {
      segments = segments.map((s) => ({ ...s, text: s2t(s.text) }));
    }
    session.segments = segments;
    session.segmentsTranslated = null;
    if (session.transcriptLanguage !== 'original') {
      updateJob(job.id, { stage: 'Translating…', progress: null });
      session.segmentsTranslated = await openrouter.translateSegments(
        segments,
        session.transcriptLanguage,
      );
    }
    saveSession(session);
    updateJob(job.id, { stage: 'Done', progress: 100, done: true });
  } catch (err: any) {
    updateJob(job.id, { stage: 'Failed', error: err?.message ?? String(err), done: true });
  }
}

async function runSummary(session: Session, job: Job, opts: { style: SummaryStyle; length: SummaryLength }): Promise<void> {
  try {
    const transcript = transcriptText(session.segments);
    if (transcript.trim().length < 20) {
      throw new Error('Transcript is empty or too short to summarise.');
    }
    updateJob(job.id, { stage: 'Summarising…', progress: null });
    const summary = await openrouter.summarize(
      transcript,
      session.outputLanguage,
      opts.length,
      opts.style,
    );
    session.summaryMarkdown = summary;
    saveSession(session);
    updateJob(job.id, { stage: 'Done', progress: 100, done: true });
  } catch (err: any) {
    updateJob(job.id, { stage: 'Failed', error: err?.message ?? String(err), done: true });
  }
}

async function runQuiz(session: Session, job: Job, count: number): Promise<void> {
  try {
    const transcript = transcriptText(session.segments);
    if (transcript.trim().length < 20) {
      throw new Error('Transcript is empty or too short to quiz on.');
    }
    updateJob(job.id, { stage: 'Generating questions…', progress: null });
    const questions = await openrouter.makeQuiz(transcript, session.outputLanguage, count);

    updateJob(job.id, { stage: 'Creating the Google Form…', progress: null });
    const title = `${session.filename.replace(/\.[^.]+$/, '')} — Quiz`;
    const description = `Auto-generated quiz with ${questions.length} questions based on the session `
      + `recording '${session.filename.replace(/\.[^.]+$/, '')}'. 1 point each.`;
    const token = await google.validAccessToken();
    const quiz = await google.createQuizForm(title, description, questions, token.accessToken);
    session.quiz = quiz;
    saveSession(session);
    updateJob(job.id, { stage: 'Done', progress: 100, done: true });
  } catch (err: any) {
    updateJob(job.id, { stage: 'Failed', error: err?.message ?? String(err), done: true });
  }
}

function startJob(session: Session, job: Job, runner: () => Promise<void>): void {
  // Fire and forget — the client polls the job endpoint. Errors are captured
  // inside the runner and stored on the job, so nothing escapes as an
  // unhandled rejection.
  runner().catch(() => {});
}

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  const g = google.status();
  res.json({
    ok: true,
    model: config.openRouterModel,
    sttModel: config.openRouterSttModel,
    hasApiKey: !!config.openRouterApiKey,
    google: g,
  });
});

app.get('/api/sessions', (_req, res) => {
  res.json({ sessions: listSessions() });
});

app.post('/api/sessions', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No audio file was uploaded.' });
    return;
  }
  const originalName = decodeName(file.originalname || 'recording');
  const ext = originalName.split('.').pop()?.toLowerCase() || '';
  if (!allowedAudioExtensions.includes(ext)) {
    fs.rmSync(file.path, { force: true });
    res.status(400).json({
      error: `Unsupported file type '.${ext}'. Use MP3, WAV, M4A, AAC, OGG, FLAC or MP4.`,
    });
    return;
  }
  const audioLanguage = (req.body.audioLanguage as Session['audioLanguage']) || 'auto';
  const outputLanguage = (req.body.outputLanguage as OutputLanguage) || 'zh-HK';
  const transcriptLanguage = (req.body.transcriptLanguage as TranscriptLanguage) || 'original';

  const session = createSession({
    filename: originalName,
    audioLanguage,
    outputLanguage,
    transcriptLanguage,
    audioFile: '', // set below after the id exists
  });
  const finalName = `${session.id}.${ext}`;
  fs.renameSync(file.path, path.join(config.uploadsDir, finalName));
  session.audioFile = finalName;
  saveSession(session);

  const job = createJob(session.id, 'transcribe', 'Queued');
  startJob(session, job, () => runTranscription(session, job));

  res.status(201).json({ session, job: jobJson(job) });
});

app.get('/api/sessions/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  res.json({ session });
});

app.patch('/api/sessions/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  if (typeof req.body.filename === 'string' && req.body.filename.trim()) {
    const name = req.body.filename.trim();
    const ext = session.audioFile.split('.').pop() || '';
    renameSession(session.id, ext ? `${name}.${ext}` : name);
    res.json({ session: getSession(session.id) });
    return;
  }
  res.status(400).json({ error: 'Provide a filename.' });
});

app.delete('/api/sessions/:id', (req, res) => {
  deleteSession(req.params.id);
  res.json({ ok: true });
});

app.post('/api/sessions/:id/transcribe', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  const job = createJob(session.id, 'transcribe', 'Queued');
  startJob(session, job, () => runTranscription(session, job));
  res.status(202).json({ job: jobJson(job) });
});

app.post('/api/sessions/:id/summary', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  const style: SummaryStyle = req.body.style === 'minutes' ? 'minutes' : 'lesson';
  const length: SummaryLength =
    req.body.length === 'brief' || req.body.length === 'in-depth' ? req.body.length : 'standard';
  const job = createJob(session.id, 'summary', 'Queued');
  startJob(session, job, () => runSummary(session, job, { style, length }));
  res.status(202).json({ job: jobJson(job) });
});

app.post('/api/sessions/:id/quiz', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  if (!config.googleConfigured) {
    res.status(400).json({ error: 'Google sign-in is not configured on this server.' });
    return;
  }
  const count = Math.max(1, Math.min(Number(req.body.count) || 10, 20));
  const job = createJob(session.id, 'quiz', 'Queued');
  startJob(session, job, () => runQuiz(session, job, count));
  res.status(202).json({ job: jobJson(job) });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }
  res.json({ job: jobJson(job) });
});

app.get('/api/sessions/:id/export/:kind', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  const kind = req.params.kind === 'summary' ? 'summary' : 'transcript';
  const text = kind === 'summary' ? (session.summaryMarkdown ?? '') : transcriptText(session.segments);
  if (!text.trim()) {
    res.status(400).json({ error: kind === 'summary' ? 'Generate a summary first.' : 'Nothing to export yet.' });
    return;
  }
  const base = exportBase(session.filename);
  const format = req.query.format === 'txt' ? 'txt' : 'docx';

  if (format === 'txt') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}-${kind}.txt"`);
    res.send(text);
    return;
  }
  const buffer = await buildDocx(kind, text, session.filename.replace(/\.[^.]+$/, ''));
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${base}-${kind}.docx"`);
  res.send(buffer);
});

// ---------------------------------------------------------------------------
// Google sign-in
// ---------------------------------------------------------------------------

const oauthStates = new Map<string, number>();

app.get('/api/google/status', (_req, res) => {
  res.json(google.status());
});

app.get('/api/google/login', (_req, res) => {
  if (!config.googleConfigured) {
    res.status(400).json({ error: 'Google sign-in is not configured on this server.' });
    return;
  }
  const state = crypto.randomBytes(12).toString('hex');
  oauthStates.set(state, Date.now());
  res.redirect(google.buildAuthUrl(state));
});

app.get('/api/google/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const fallback = `<!doctype html><html><body style="font-family:sans-serif;background:#101010;color:#e5e5e5;padding:40px"><p>{{msg}}</p><script>setTimeout(function(){window.close()},1500)</script></body></html>`;
  const respond = (msg: string) => res.status(400).send(fallback.replace('{{msg}}', msg));

  if (error) {
    respond('Google sign-in was declined.');
    return;
  }
  if (!state || !oauthStates.has(state)) {
    respond('Sign-in session expired — please try again.');
    return;
  }
  oauthStates.delete(state);
  if (!code) {
    respond('No authorisation code was returned.');
    return;
  }
  try {
    await google.exchangeCode(code);
    const done = `<!doctype html><html><body style="font-family:sans-serif;background:#101010;color:#e5e5e5;padding:40px"><p>Google sign-in complete — you can close this window.</p><script>setTimeout(function(){window.close()},1200)</script></body></html>`;
    res.send(done);
  } catch (err: any) {
    respond(err?.message ?? 'Google sign-in failed.');
  }
});

app.post('/api/google/logout', (_req, res) => {
  google.signOut();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 404 for unknown API routes, then static web app
// ---------------------------------------------------------------------------

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

const indexHtml = path.join(config.webDist, 'index.html');
if (fs.existsSync(indexHtml)) {
  app.use(express.static(config.webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(indexHtml);
  });
}

app.listen(config.port, config.host, () => {
  const servingWeb = fs.existsSync(indexHtml) ? ' + web app' : '';
  console.log(`[transcriber] listening on http://${config.host}:${config.port} (api${servingWeb})`);
  if (!config.openRouterApiKey) {
    console.warn('[transcriber] WARNING: OPENROUTER_API_KEY is not set — transcription/summary/quiz will fail.');
  }
  if (!config.googleConfigured) {
    console.warn('[transcriber] Google sign-in is not configured — the quiz button will be disabled.');
  }
});
