import { useRef, useState } from 'react';
import * as api from '../api';
import { Icon } from '../icons';
import type { Settings } from '../settings';
import type { Job, OutputLanguage, Session, SummaryStyle, TranscriptLanguage } from '../types';
import { OUTPUT_LANGUAGES, TRANSCRIPT_LANGUAGES } from '../types';
import { ErrorBanner, RowCard, SectionLabel, Segmented, SettingRow } from './ui';

interface Props {
  settings: Settings;
  onCreated: (session: Session, job: Job, blobUrl: string) => void;
}

export default function NewSession({ settings, onCreated }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [transcriptLanguage, setTranscriptLanguage] = useState<TranscriptLanguage>('original');
  const [summaryStyle, setSummaryStyle] = useState<SummaryStyle>('lesson');
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage | ''>('');
  const [quizCount, setQuizCount] = useState<number | ''>('');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<{ file?: boolean; outputLanguage?: boolean; quizCount?: boolean }>({});
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setFile(file);
    setError(null);
    setMissing((m) => ({ ...m, file: false }));
  }

  async function handleStart() {
    if (!file || !outputLanguage || !quizCount) {
      setMissing({ file: !file, outputLanguage: !outputLanguage, quizCount: !quizCount });
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const { session, job } = await api.createSession(file, {
        audioLanguage: settings.audioLanguage,
        transcriptLanguage,
        outputLanguage,
        summaryStyle,
        quizCount,
      });
      onCreated(session, job, URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setUploading(false);
    }
  }

  return (
    <div className="content">
      <h1 className="title">Transcriber</h1>
      <p className="subtitle">Drop a recording, choose the options below, then press Start.</p>
      <hr className="divider" />

      <div
        className={`dropzone ${dragging ? 'drag' : ''} ${missing.file ? 'field-error' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) handleFile(dropped);
        }}
      >
        {file ? (
          <>
            <div className="drop-icon">
              <Icon name="check" size={32} />
            </div>
            <p className="drop-line">
              <strong>{file.name}</strong>
            </p>
            <p className="hint">Click to choose a different file</p>
          </>
        ) : (
          <>
            <div className="drop-icon">
              <Icon name="headphones" size={40} />
            </div>
            <p className="drop-line">
              <strong>Drop an audio or video file here</strong> or browse
            </p>
            <p className="hint">MP3 · WAV · M4A · AAC · OGG · FLAC · MP4</p>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,audio/*,video/*"
          hidden
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            if (chosen) handleFile(chosen);
            e.target.value = '';
          }}
        />
      </div>
      {missing.file && <div className="field-error-text">Please add a file.</div>}

      <SectionLabel>Options</SectionLabel>
      <RowCard>
        <SettingRow
          title="Transcript language"
          sub="Original, or original with a translated version beneath each line"
        >
          <select
            value={transcriptLanguage}
            onChange={(e) => setTranscriptLanguage(e.target.value as TranscriptLanguage)}
          >
            {TRANSCRIPT_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow title="Summary style" sub="Lesson summary or meeting minutes">
          <Segmented
            value={summaryStyle}
            options={[
              { value: 'lesson' as const, label: 'Lesson summary' },
              { value: 'minutes' as const, label: 'Meeting minutes' },
            ]}
            onChange={(value) => setSummaryStyle(value)}
          />
        </SettingRow>
        <SettingRow title="AI language" sub="Language for the AI summary and quiz">
          <div style={{ textAlign: 'right' }}>
            <select
              className={missing.outputLanguage ? 'field-error' : ''}
              value={outputLanguage}
              onChange={(e) => {
                setOutputLanguage(e.target.value as OutputLanguage);
                setMissing((m) => ({ ...m, outputLanguage: false }));
              }}
            >
              <option value="" disabled>
                Choose…
              </option>
              {OUTPUT_LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
            {missing.outputLanguage && <div className="field-error-text">Required</div>}
          </div>
        </SettingRow>
        <SettingRow title="Quiz length" sub="Number of questions per generated quiz">
          <div style={{ textAlign: 'right' }}>
            <select
              className={missing.quizCount ? 'field-error' : ''}
              value={quizCount}
              onChange={(e) => {
                setQuizCount(e.target.value === '' ? '' : Number(e.target.value));
                setMissing((m) => ({ ...m, quizCount: false }));
              }}
            >
              <option value="" disabled>
                Choose…
              </option>
              <option value={5}>5 questions</option>
              <option value={10}>10 questions</option>
              <option value={15}>15 questions</option>
            </select>
            {missing.quizCount && <div className="field-error-text">Required</div>}
          </div>
        </SettingRow>
      </RowCard>

      {error && <ErrorBanner message={error} />}

      <div style={{ marginTop: 18 }}>
        <button
          className="btn btn-primary"
          onClick={() => void handleStart()}
          disabled={uploading}
          style={{ fontSize: 14, padding: '9px 26px' }}
        >
          <Icon name="sparkles" size={15} /> {uploading ? 'Uploading…' : 'Start'}
        </button>
      </div>

      <p className="hint" style={{ marginTop: 16 }}>
        Transcription: audio is sent to OpenRouter speech-to-text. Summaries &amp; quizzes:
        transcript text is sent to OpenRouter. Quiz forms are created in your Google Drive.
      </p>
    </div>
  );
}
