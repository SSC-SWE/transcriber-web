import { useEffect, useState } from 'react';
import * as api from '../api';
import { Icon } from '../icons';
import type { Settings } from '../settings';
import type { AudioLanguage, GoogleStatus, OutputLanguage, TranscriptLanguage } from '../types';
import { AUDIO_LANGUAGES, OUTPUT_LANGUAGES, TRANSCRIPT_LANGUAGES } from '../types';
import { RowCard, SectionLabel, Segmented, SettingRow } from './ui';

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const LENGTH_BLURBS: Record<Settings['summaryLength'], string> = {
  brief: 'A quick overview with a few sentences and essentials.',
  standard: 'The default: overview, key points, follow-ups.',
  'in-depth': 'Fuller notes with more detail in every section.',
};

export default function SettingsView({ settings, update }: Props) {
  const [google, setGoogle] = useState<GoogleStatus | null>(null);

  const refreshGoogle = () => {
    api.googleStatus().then(setGoogle).catch(() => {});
  };

  useEffect(() => {
    refreshGoogle();
  }, []);

  const handleSignIn = () => {
    const popup = window.open('/api/google/login', 'google-signin', 'width=520,height=680');
    if (!popup) {
      window.alert('Popup blocked — allow popups to sign in with Google.');
      return;
    }
    const timer = setInterval(async () => {
      try {
        const status = await api.googleStatus();
        if (status.signedIn) {
          clearInterval(timer);
          refreshGoogle();
          return;
        }
      } catch {
        // ignore transient errors
      }
      if (popup.closed) {
        clearInterval(timer);
        refreshGoogle();
      }
    }, 1500);
  };

  return (
    <div className="content" style={{ maxWidth: 620 }}>
      <h1 className="title">Settings</h1>
      <hr className="divider" />

      <SectionLabel>Transcription</SectionLabel>
      <RowCard>
        <SettingRow
          title="Session audio language"
          sub="Default language spoken in new recordings — can still be changed per session when importing."
        >
          <select
            value={settings.audioLanguage}
            onChange={(e) => update({ audioLanguage: e.target.value as AudioLanguage })}
          >
            {AUDIO_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow
          title="Transcript language"
          sub="Default language for new transcripts — original, or translated (both are kept)."
        >
          <select
            value={settings.transcriptLanguage}
            onChange={(e) => update({ transcriptLanguage: e.target.value as TranscriptLanguage })}
          >
            {TRANSCRIPT_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </SettingRow>
      </RowCard>

      <SectionLabel>AI</SectionLabel>
      <RowCard>
        <SettingRow
          title="Summary style"
          sub={settings.summaryStyle === 'lesson'
            ? 'Overview, key points, terms and follow-ups — tuned for classes.'
            : 'Topics discussed, decisions and action items — tuned for meetings.'}
        >
          <Segmented
            value={settings.summaryStyle}
            options={[
              { value: 'lesson' as const, label: 'Lesson summary' },
              { value: 'minutes' as const, label: 'Meeting minutes' },
            ]}
            onChange={(value) => update({ summaryStyle: value })}
          />
        </SettingRow>
        <SettingRow title="Summary length" sub={LENGTH_BLURBS[settings.summaryLength]}>
          <Segmented
            value={settings.summaryLength}
            options={[
              { value: 'brief' as const, label: 'Brief' },
              { value: 'standard' as const, label: 'Standard' },
              { value: 'in-depth' as const, label: 'In-depth' },
            ]}
            onChange={(value) => update({ summaryLength: value })}
          />
        </SettingRow>
        <SettingRow
          title="AI language"
          sub="Language for AI summaries and quizzes — can still be changed per session."
        >
          <select
            value={settings.outputLanguage}
            onChange={(e) => update({ outputLanguage: e.target.value as OutputLanguage })}
          >
            {OUTPUT_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow title="Quiz length" sub="Number of questions per generated quiz.">
          <select
            value={settings.quizCount}
            onChange={(e) => update({ quizCount: Number(e.target.value) })}
          >
            <option value={5}>5 questions</option>
            <option value={10}>10 questions</option>
            <option value={15}>15 questions</option>
          </select>
        </SettingRow>
      </RowCard>

      <SectionLabel>Google Account</SectionLabel>
      <RowCard>
        <SettingRow
          title={google?.signedIn ? (google.email ?? 'Signed in') : 'Not signed in'}
          sub={
            !google?.configured
              ? 'Google sign-in is not configured on this server — the quiz button is disabled.'
              : google?.signedIn
                ? 'AI quiz forms are unlocked for this account.'
                : 'AI quiz forms unlock after a one-time Google sign-in — you stay signed in until you log out.'
          }
        >
          {google?.signedIn ? (
            <button
              className="btn btn-danger"
              onClick={async () => {
                await api.googleLogout();
                refreshGoogle();
              }}
            >
              Log Out
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleSignIn} disabled={!google?.configured}>
              <Icon name="google" size={14} /> Log In with Google
            </button>
          )}
        </SettingRow>
      </RowCard>
    </div>
  );
}
