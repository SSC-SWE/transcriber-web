import { useEffect, useState } from 'react';
import * as api from '../api';
import { Icon } from '../icons';
import type { Settings } from '../settings';
import type { AudioLanguage, GoogleStatus } from '../types';
import { AUDIO_LANGUAGES } from '../types';
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
          sub="Default language spoken in new recordings (auto-detect is fine for most)."
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
      </RowCard>

      <SectionLabel>AI</SectionLabel>
      <RowCard>
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
