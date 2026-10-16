import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api';
import { displayName, formatDate, formatTimestamp } from '../format';
import { Icon } from '../icons';
import { markdownToHtml } from '../markdown';
import { transcriptHtml } from '../print';
import type { Job, Session } from '../types';
import type { Settings } from '../settings';
import AIOverlay, { type OverlayState } from './AIOverlay';
import Editor from './Editor';
import ExportButtons from './Exports';
import ProgressCard from './ProgressCard';
import { QuizView, SummaryView } from './SummaryQuiz';
import { Card, ErrorBanner, Segmented } from './ui';

type Tab = 'transcript' | 'summary' | 'quiz';

interface Props {
  id: string;
  initialJob: Job | null;
  /** Blob URL of the uploaded file (browser memory only, not server-stored). */
  audioSrc?: string;
  settings: Settings;
  googleConfigured: boolean;
  onChanged: () => void;
  onDeleted: () => void;
}

function pollJob(jobId: string): Promise<Job> {
  return new Promise((resolve) => {
    const timer = setInterval(async () => {
      try {
        const job = await api.getJob(jobId);
        if (job.done) {
          clearInterval(timer);
          resolve(job);
        }
      } catch {
        // transient poll failure — keep waiting
      }
    }, 1200);
  });
}

function waitForGoogleSignIn(): Promise<boolean> {
  return new Promise((resolve) => {
    const popup = window.open('/api/google/login', 'google-signin', 'width=520,height=680');
    if (!popup) {
      resolve(false);
      return;
    }
    const started = Date.now();
    const timer = setInterval(async () => {
      try {
        const status = await api.googleStatus();
        if (status.signedIn) {
          clearInterval(timer);
          resolve(true);
          return;
        }
      } catch {
        // ignore transient errors
      }
      if (popup.closed || Date.now() - started > 180_000) {
        clearInterval(timer);
        resolve(false);
      }
    }, 1500);
  });
}

export default function SessionDetail({ id, initialJob, audioSrc, settings, googleConfigured, onChanged, onDeleted }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Tab>('transcript');
  const [transcribeJob, setTranscribeJob] = useState<Job | null>(initialJob);
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcriptView, setTranscriptView] = useState<'original' | 'translated'>('original');
  const runningRef = useRef(false);

  const refreshSession = useCallback(async () => {
    try {
      const fresh = await api.getSession(id);
      setSession(fresh);
    } catch {
      // keep the last known state
    }
  }, [id]);

  useEffect(() => {
    setSession(null);
    setTab('transcript');
    setError(null);
    void refreshSession();
  }, [refreshSession]);

  // Poll the transcription job (from upload) until it completes.
  useEffect(() => {
    if (!transcribeJob || transcribeJob.done) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const job = await api.getJob(transcribeJob.id);
        if (cancelled) return;
        if (job.done) {
          setTranscribeJob(null);
          await refreshSession();
          if (job.error) setError(job.error);
        }
      } catch {
        // keep polling
      }
    }, 1200);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [transcribeJob, refreshSession]);

  async function handleSummary() {
    if (runningRef.current) return;
    runningRef.current = true;
    setError(null);
    setOverlay({ kind: 'summary', phase: 'working' });
    try {
      const job = await api.summarize(id, settings.summaryStyle, settings.summaryLength);
      const done = await pollJob(job.id);
      if (done.error) setError(done.error);
      else {
        await refreshSession();
        onChanged();
      }
      setOverlay(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setOverlay(null);
    } finally {
      runningRef.current = false;
    }
  }

  async function handleQuiz() {
    if (runningRef.current) return;
    runningRef.current = true;
    setError(null);
    try {
      const status = await api.googleStatus();
      if (!status.signedIn) {
        setOverlay({ kind: 'quiz', phase: 'auth' });
        const ok = await waitForGoogleSignIn();
        if (!ok) {
          setOverlay({ kind: 'quiz', phase: 'authFailed', error: 'Sign-in didn’t complete.' });
          return;
        }
      }
      setOverlay({ kind: 'quiz', phase: 'working' });
      const job = await api.generateQuiz(id, settings.quizCount);
      const done = await pollJob(job.id);
      if (done.error) setError(done.error);
      else {
        await refreshSession();
        setTab('quiz');
        onChanged();
      }
      setOverlay(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setOverlay(null);
    } finally {
      runningRef.current = false;
    }
  }

  if (!session) {
    return (
      <div className="content">
        <p className="subtitle">Loading…</p>
      </div>
    );
  }

  const duration = session.segments.length ? session.segments[session.segments.length - 1].end : 0;
  const showTranslated = transcriptView === 'translated' && !!session.segmentsTranslated;
  const displaySegments = showTranslated ? session.segmentsTranslated! : session.segments;
  const transcriptPlain = displaySegments
    .map((s) => `[${formatTimestamp(s.start)}] ${s.text}`)
    .join('\n');
  const pdfTitle = displayName(session.filename);
  const hasTranscript = displaySegments.length > 0;
  const aiBusy = overlay !== null;

  return (
    <div className="content" style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="title" style={{ marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName(session.filename)}
          </h1>
          <p className="subtitle" style={{ marginBottom: 0 }}>
            {formatDate(session.createdAt)}
            {duration > 0 && ` · Duration ${formatTimestamp(duration)}`}
            {' · '}Audio: {AUDIO_LANG_LABEL[session.audioLanguage]}
          </p>
        </div>
        <button
          className="btn btn-danger"
          style={{ flexShrink: 0 }}
          onClick={() => {
            if (window.confirm(`Delete “${displayName(session.filename)}”?`)) onDeleted();
          }}
        >
          <Icon name="trash" size={14} /> Delete
        </button>
      </div>
      <hr className="divider" />

      {error && <ErrorBanner message={error} />}
      {transcribeJob && <ProgressCard job={transcribeJob} />}

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <button
          className="btn btn-primary"
          disabled={!hasTranscript || aiBusy}
          onClick={() => void handleSummary()}
        >
          <Icon name="sparkles" size={14} /> AI Summary
        </button>
        <button
          className="btn btn-primary"
          disabled={!hasTranscript || !googleConfigured || aiBusy}
          onClick={() => void handleQuiz()}
          title={googleConfigured ? undefined : 'Google sign-in is not configured on this server'}
        >
          <Icon name="list" size={14} /> Generate Google Form Quiz
        </button>
      </div>

      <div className="tabs">
        <TabButton active={tab === 'transcript'} onClick={() => setTab('transcript')}>
          Transcript
        </TabButton>
        <TabButton active={tab === 'summary'} onClick={() => setTab('summary')}>
          Summary
        </TabButton>
        {session.quiz && (
          <TabButton active={tab === 'quiz'} onClick={() => setTab('quiz')}>
            Quiz
          </TabButton>
        )}
      </div>

      {tab === 'transcript' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
            <span className="card-sub">
              {hasTranscript
                ? `${displaySegments.length} segments · ${formatTimestamp(duration)}`
                : 'No transcript yet'}
            </span>
            {hasTranscript && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {session.segmentsTranslated && (
                  <Segmented
                    value={transcriptView}
                    options={[
                      { value: 'original' as const, label: 'Original' },
                      { value: 'translated' as const, label: 'Translated' },
                    ]}
                    onChange={(value) => setTranscriptView(value)}
                  />
                )}
                <ExportButtons
                  sessionId={id}
                  kind="transcript"
                  copyText={transcriptPlain}
                  pdfTitle={pdfTitle}
                  pdfBodyHtml={transcriptHtml(displaySegments.map((s) => ({ start: s.start, text: s.text })))}
                />
              </div>
            )}
          </div>
          <Editor src={audioSrc} segments={displaySegments} />
        </>
      )}

      {tab === 'summary' &&
        (session.summaryMarkdown ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <ExportButtons
                sessionId={id}
                kind="summary"
                copyText={session.summaryMarkdown}
                pdfTitle={`${pdfTitle} — Summary`}
                pdfBodyHtml={markdownToHtml(session.summaryMarkdown)}
              />
            </div>
            <SummaryView summary={session.summaryMarkdown} />
          </>
        ) : (
          <Card>
            <div className="empty-state">No summary yet — click “AI Summary”.</div>
          </Card>
        ))}

      {tab === 'quiz' && session.quiz && <QuizView quiz={session.quiz} />}

      {overlay && <AIOverlay overlay={overlay} onCancel={() => setOverlay(null)} onRetry={() => void handleQuiz()} />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`tab ${active ? 'active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

const AUDIO_LANG_LABEL: Record<Session['audioLanguage'], string> = {
  auto: 'Auto-detect',
  yue: 'Cantonese 粵語',
  zh: 'Mandarin 普通話',
  en: 'English',
};
