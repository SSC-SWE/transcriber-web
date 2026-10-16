import { useRef, useState } from 'react';
import * as api from '../api';
import { Icon } from '../icons';
import type { AudioLanguage, Job, OutputLanguage, Session, TranscriptLanguage } from '../types';
import { AUDIO_LANGUAGES, OUTPUT_LANGUAGES, TRANSCRIPT_LANGUAGES } from '../types';
import { ErrorBanner, RowCard, SectionLabel, SettingRow } from './ui';

interface Props {
  settings: { audioLanguage: AudioLanguage; outputLanguage: OutputLanguage; transcriptLanguage: TranscriptLanguage };
  onCreated: (session: Session, job: Job, blobUrl: string) => void;
}

export default function NewSession({ settings, onCreated }: Props) {
  const [audioLanguage, setAudioLanguage] = useState<AudioLanguage>(settings.audioLanguage);
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>(settings.outputLanguage);
  const [transcriptLanguage, setTranscriptLanguage] = useState<TranscriptLanguage>(settings.transcriptLanguage);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const { session, job } = await api.createSession(file, audioLanguage, outputLanguage, transcriptLanguage);
      onCreated(session, job, URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setUploading(false);
    }
  }

  return (
    <div className="content">
      <h1 className="title">Transcriber</h1>
      <p className="subtitle">
        Drop a session recording → transcription runs via OpenRouter → AI summary &amp; Google
        Form quiz below.
      </p>
      <hr className="divider" />

      <div
        className={`dropzone ${dragging ? 'drag' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
      >
        <div className="drop-icon">
          <Icon name="headphones" size={40} />
        </div>
        {uploading ? (
          <p className="drop-line">Uploading…</p>
        ) : (
          <>
            <p className="drop-line">
              <strong>Drop an audio file here</strong> or browse
            </p>
            <p className="hint">MP3 · WAV · M4A · AAC · OGG · FLAC · MP4</p>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,audio/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      <SectionLabel>Options</SectionLabel>
      <RowCard>
        <SettingRow title="Session audio" sub="Language spoken in the recording">
          <select
            value={audioLanguage}
            onChange={(e) => setAudioLanguage(e.target.value as AudioLanguage)}
          >
            {AUDIO_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow title="Summary & quiz language" sub="Language for the AI summary and the quiz">
          <select
            value={outputLanguage}
            onChange={(e) => setOutputLanguage(e.target.value as OutputLanguage)}
          >
            {OUTPUT_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow
          title="Transcript language"
          sub="Language the transcript is shown in — original, or translated (both are kept)"
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
      </RowCard>

      {error && <ErrorBanner message={error} />}

      <p className="hint" style={{ marginTop: 16 }}>
        Transcription: audio is sent to OpenRouter speech-to-text. Summaries &amp; quizzes:
        transcript text is sent to OpenRouter. Quiz forms are created in your Google Drive.
      </p>
    </div>
  );
}
