import fs from 'fs';
import path from 'path';

// Load .env (repo root or server/) into process.env for any key not already
// set, so real environment variables always win over the file.
function loadDotEnv(): void {
  const candidates = [
    path.join(__dirname, '..', '..', '.env'),
    path.join(__dirname, '..', '.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
      const match = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const key = match[1];
      if (key in process.env) continue;
      process.env[key] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}
loadDotEnv();

export const SERVER_ROOT = path.join(__dirname, '..');

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  uploadsDir: string;
  sessionsDir: string;
  googleTokenFile: string;

  openRouterApiKey: string;
  openRouterModel: string;
  openRouterSttModel: string;

  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  googleConfigured: boolean;

  /** Absolute path of the built web app (web/dist), served in production. */
  webDist: string;
}

function resolveDataDir(): string {
  const raw = process.env.DATA_DIR || path.join(SERVER_ROOT, 'data');
  return path.isAbsolute(raw) ? raw : path.resolve(SERVER_ROOT, '..', raw);
}

const dataDir = resolveDataDir();

export const config: Config = {
  port: Number(process.env.PORT) || 8787,
  host: process.env.HOST || '127.0.0.1',
  dataDir,
  uploadsDir: path.join(dataDir, 'uploads'),
  sessionsDir: path.join(dataDir, 'sessions'),
  googleTokenFile: path.join(dataDir, 'google-token.json'),

  openRouterApiKey: (process.env.OPENROUTER_API_KEY || '').trim(),
  openRouterModel: (process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat').trim(),
  openRouterSttModel: (process.env.OPENROUTER_STT_MODEL || 'openai/whisper-large-v3').trim(),

  googleClientId: (process.env.GOOGLE_CLIENT_ID || '').trim(),
  googleClientSecret: (process.env.GOOGLE_CLIENT_SECRET || '').trim(),
  googleRedirectUri: (process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8787/api/google/callback').trim(),
  googleConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),

  webDist: path.join(__dirname, '..', '..', 'web', 'dist'),
};

/** Ensure the data directories exist. Called once at startup. */
export function ensureDataDirs(): void {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  fs.mkdirSync(config.sessionsDir, { recursive: true });
}
