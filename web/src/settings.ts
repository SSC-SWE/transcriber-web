import { useEffect, useState } from 'react';
import type { AudioLanguage, OutputLanguage, SummaryLength, SummaryStyle, TranscriptLanguage } from './types';

// Client-side user preferences (the web equivalent of the mac app's
// UserDefaults-backed SettingsStore). Persisted in localStorage.

export interface Settings {
  audioLanguage: AudioLanguage;
  outputLanguage: OutputLanguage;
  transcriptLanguage: TranscriptLanguage;
  summaryStyle: SummaryStyle;
  summaryLength: SummaryLength;
  quizCount: number;
}

const KEY = 'transcriber.settings';

const DEFAULTS: Settings = {
  audioLanguage: 'auto',
  outputLanguage: 'zh-HK',
  transcriptLanguage: 'original',
  summaryStyle: 'lesson',
  summaryLength: 'standard',
  quizCount: 10,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // ignore corrupt settings
  }
  return DEFAULTS;
}

export function useSettings(): { settings: Settings; update: (patch: Partial<Settings>) => void } {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // localStorage unavailable — settings just won't persist
    }
  }, [settings]);
  const update = (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch }));
  return { settings, update };
}
