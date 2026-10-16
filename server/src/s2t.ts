// Simplified → Traditional Chinese conversion for the transcript.
// The mac app runs every recognised chunk through OpenCC's STCharacters +
// STPhrases tables (simplified → traditional, Taiwan standard) before it
// reaches the UI. `opencc-js` ships the same OpenCC tables, so this matches.
//
// It is a safe no-op on already-traditional or non-Chinese text, so the
// transcript always passes through here when the output language is 香港繁體.

import { Converter } from 'opencc-js';

const toTraditional = Converter({ from: 'cn', to: 'tw' });

export function s2t(input: string): string {
  return toTraditional(input);
}
