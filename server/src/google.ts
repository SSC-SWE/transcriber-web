// Google Forms API client — builds quiz forms directly in the teacher's Drive.
//
// Port of the mac app's GoogleFormsService.swift (which ports src/GForms.php),
// with the web OAuth flow: the browser opens Google's consent page and Google
// redirects back to GOOGLE_REDIRECT_URI (a route on this server), which
// exchanges the code and stores a refresh token in data/google-token.json.
// One shared token — the school signs in once and everyone's quizzes work,
// matching the "one-time Google sign-in" mental model of the native app.

import fs from 'fs';
import { config } from './config';
import type { Quiz, QuizQuestion } from './types';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FORMS_API = 'https://forms.googleapis.com/v1';
const SCOPE = 'https://www.googleapis.com/auth/forms.body openid email';

interface Token {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string | null;
}

export class GoogleError extends Error {}

// ---------------------------------------------------------------------------
// Token persistence
// ---------------------------------------------------------------------------

function loadToken(): Token | null {
  try {
    if (fs.existsSync(config.googleTokenFile)) {
      const raw = JSON.parse(fs.readFileSync(config.googleTokenFile, 'utf8'));
      if (raw && typeof raw.refreshToken === 'string') return raw as Token;
    }
  } catch {
    // ignore corrupt token files
  }
  return null;
}

function saveToken(token: Token): void {
  fs.writeFileSync(config.googleTokenFile, JSON.stringify(token, null, 2), { mode: 0o600 });
}

function clearToken(): void {
  if (fs.existsSync(config.googleTokenFile)) fs.rmSync(config.googleTokenFile);
}

// ---------------------------------------------------------------------------
// Sign-in (web redirect)
// ---------------------------------------------------------------------------

/**
 * Derive the OAuth redirect URI from the request's Host so the bounce-back
 * lands on the same origin the user actually reached (localhost in dev, the
 * tunnel or domain in production). Falls back to GOOGLE_REDIRECT_URI.
 */
export function redirectUriForRequest(
  host: string | undefined,
  forwardedProto: string | undefined,
): string {
  const h = (host || '').split(',')[0].trim();
  if (!h) return config.googleRedirectUri;
  const hostname = h.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const scheme = isLocal ? 'http' : forwardedProto === 'https' ? 'https' : 'http';
  return `${scheme}://${h}/api/google/callback`;
}

export function buildAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent select_account',
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<Token> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formEncode({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (res.status !== 200) {
    const detail = (json.error_description as string) || '';
    throw new GoogleError(`Google sign-in failed (token exchange ${res.status}): ${detail}`);
  }
  if (typeof json.access_token !== 'string') {
    throw new GoogleError('Google sign-in returned no access token.');
  }
  if (typeof json.refresh_token !== 'string' || !json.refresh_token) {
    throw new GoogleError(
      'Google sign-in returned no refresh token — revoke the app\'s access at '
      + 'myaccount.google.com/permissions and try again.',
    );
  }
  const token: Token = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
    email: emailFromIdToken(json.id_token as string | undefined),
  };
  saveToken(token);
  return token;
}

async function refresh(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formEncode({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (res.status !== 200 || typeof json.access_token !== 'string') {
    const detail = (json.error_description as string) || '';
    throw new GoogleError(`Google sign-in has expired (${res.status}) ${detail} — log in again.`);
  }
  return { accessToken: json.access_token, expiresIn: Number(json.expires_in) || 3600 };
}

export function status(): { configured: boolean; signedIn: boolean; email: string | null } {
  const token = loadToken();
  return { configured: config.googleConfigured, signedIn: !!token, email: token?.email ?? null };
}

export function signOut(): void {
  clearToken();
}

export async function validAccessToken(): Promise<Token> {
  const token = loadToken();
  if (!token) throw new GoogleError('Not signed in — sign in with Google first.');
  if (token.expiresAt > Date.now() + 60_000) return token;
  const { accessToken, expiresIn } = await refresh(token.refreshToken);
  const updated: Token = { ...token, accessToken, expiresAt: Date.now() + expiresIn * 1000 };
  saveToken(updated);
  return updated;
}

function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  const parts = idToken.split('.');
  if (parts.length < 2) return null;
  let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  while (payload.length % 4 !== 0) payload += '=';
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    return typeof json.email === 'string' ? json.email : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Form creation (port of GForms::createQuizForm)
// ---------------------------------------------------------------------------

export async function createQuizForm(
  title: string,
  description: string,
  questions: QuizQuestion[],
  accessToken: string,
): Promise<Quiz> {
  const headers = { Authorization: `Bearer ${accessToken}` };

  // 1. Create the form shell.
  const form = await perform(`${FORMS_API}/forms`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ info: { title: title || 'Session Quiz' } }),
  });
  const formId = form.formId as string | undefined;
  if (!formId) throw new GoogleError('Google Forms API returned no form id.');

  // 2. Quiz mode must be on before graded items exist.
  await perform(`${FORMS_API}/forms/${formId}:batchUpdate`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      requests: [
        { updateFormInfo: { info: { description }, updateMask: 'description' } },
        {
          updateSettings: {
            settings: {
              quizSettings: { isQuiz: true },
              emailCollectionType: 'DO_NOT_COLLECT',
            },
            updateMask: 'quizSettings,emailCollectionType',
          },
        },
      ],
    }),
  });

  // 3. The questions themselves.
  await perform(`${FORMS_API}/forms/${formId}:batchUpdate`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      requests: questions.map((question, index) => ({
        createItem: { item: questionItem(question), location: { index } },
      })),
    }),
  });

  return {
    title,
    description,
    questions,
    formURL: (form.responderUri as string) || '',
    formEditURL: `https://docs.google.com/forms/d/${formId}/edit`,
  };
}

/** Radio question, 1 point, correct answer marked, explanation on wrong answers. */
function questionItem(q: QuizQuestion): Record<string, unknown> {
  if (!q.options[q.answer]) {
    throw new GoogleError('A quiz question was malformed (missing options or answer).');
  }
  const grading: Record<string, unknown> = {
    pointValue: 1,
    correctAnswers: { answers: [{ value: q.options[q.answer] }] },
  };
  if (q.explanation.trim()) {
    grading.whenWrong = { text: q.explanation };
  }
  return {
    title: q.question,
    questionItem: {
      question: {
        required: true,
        choiceQuestion: {
          type: 'RADIO',
          options: q.options.map((value) => ({ value })),
        },
        grading,
      },
    },
  };
}

async function perform(url: string, init: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err: any) {
    throw new GoogleError(`Could not reach the Google Forms API: ${err?.message ?? err}`);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (res.status >= 400) {
    const message = data?.error?.message || '';
    throw new GoogleError(`Google Forms API error (${res.status}): ${message}`);
  }
  return data;
}

function formEncode(form: Record<string, string>): string {
  return Object.entries(form)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}
