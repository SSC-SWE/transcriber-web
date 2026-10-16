// OpenRouter client: speech-to-text (STT), AI summary and quiz generation.
//
// Direct port of the mac app's OpenRouterClient.swift + Llm.php — same
// endpoints, same prompts, same validation, so the web app produces the same
// summaries and quizzes as the native app.

import { config } from './config';
import type {
  AudioLanguage,
  OutputLanguage,
  QuizQuestion,
  SummaryLength,
  SummaryStyle,
  TranscriptSegment,
} from './types';

const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const STT_URL = 'https://openrouter.ai/api/v1/audio/transcriptions';

export class ApiError extends Error {}

function languageRule(lang: OutputLanguage): string {
  switch (lang) {
    case 'zh-HK':
      return 'Traditional Chinese as used in Hong Kong (香港繁體). Use Traditional '
        + 'characters and HK written conventions; keep English technical terms in '
        + 'English where that is natural for a HK classroom.';
    case 'zh-CN':
      return 'Simplified Chinese (简体中文).';
    case 'en':
      return 'English.';
  }
}

// Whisper accepts ISO codes; large-v3 supports Cantonese as "yue".
function sttLanguageHint(lang: AudioLanguage): string | undefined {
  switch (lang) {
    case 'auto': return undefined;
    case 'yue': return 'yue';
    case 'zh': return 'zh';
    case 'en': return 'en';
  }
}

// ---------------------------------------------------------------------------
// Speech-to-text
// ---------------------------------------------------------------------------

export interface TranscriptionResult {
  text: string;
  segments: TranscriptSegment[];
}

/** Rough size guard: Whisper-class models cap at ~25 MB of audio. */
const WHISPER_MAX_BYTES = 24 * 1024 * 1024;

export async function transcribe(
  audio: Buffer,
  format: string,
  language: AudioLanguage,
): Promise<TranscriptionResult> {
  if (!config.openRouterApiKey) {
    throw new ApiError('OpenRouter API key is missing — set OPENROUTER_API_KEY in .env.');
  }
  const model = config.openRouterSttModel;
  if (model.includes('whisper') && audio.length > WHISPER_MAX_BYTES) {
    throw new ApiError(
      'This recording is too large for Whisper (25 MB audio limit). Set '
      + 'OPENROUTER_STT_MODEL=google/chirp-3 in .env for long recordings, '
      + 'or split the file.',
    );
  }

  const hint = sttLanguageHint(language);
  const body: Record<string, unknown> = {
    model,
    input_audio: { data: audio.toString('base64'), format },
    response_format: 'verbose_json',
  };
  if (hint) body.language = hint;

  const data = await postJson(STT_URL, body);
  const text = (data.text as string) ?? '';
  const segments = parseSegments(data.segments, text);
  if (!text && segments.length === 0) {
    throw new ApiError('The transcription service returned no text.');
  }
  return { text, segments };
}

function parseSegments(raw: unknown, fullText: string): TranscriptSegment[] {
  if (!Array.isArray(raw)) {
    return fullText.trim() ? [{ start: 0, end: 0, text: fullText.trim() }] : [];
  }
  const out: TranscriptSegment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    const text = typeof s.text === 'string' ? s.text.trim() : '';
    const start = typeof s.start === 'number' ? s.start : NaN;
    const end = typeof s.end === 'number' ? s.end : NaN;
    if (!text) continue;
    out.push({ start: Number.isFinite(start) ? start : 0, end: Number.isFinite(end) ? end : 0, text });
  }
  if (out.length === 0 && fullText.trim()) {
    return [{ start: 0, end: 0, text: fullText.trim() }];
  }
  return out;
}

// ---------------------------------------------------------------------------
// AI summary
// ---------------------------------------------------------------------------

export async function summarize(
  transcript: string,
  lang: OutputLanguage,
  length: SummaryLength,
  style: SummaryStyle,
): Promise<string> {
  const rule = languageRule(lang);
  if (style === 'minutes') return summarizeMinutes(transcript, rule, length);
  return summarizeLesson(transcript, rule, length);
}

function summarizeLesson(transcript: string, rule: string, length: SummaryLength): Promise<string> {
  const intro = 'You are an experienced teaching assistant who summarises session transcripts '
    + `for teachers. Write everything in ${rule}\n`;
  let body: string;
  switch (length) {
    case 'brief':
      body = 'Produce a concise Markdown summary with these sections:\n'
        + '## Overview — 1-2 sentences on what the session covered\n'
        + '## Key Points — at most 5 short bullets\n'
        + '## Key Terms — at most 3 essential terms, one line each (omit the section if none)\n'
        + '## Follow-ups — a single line listing homework/reminders, if any\n'
        + 'Omit ## Examples. Keep the whole summary under 150 words. '
        + 'Use only facts from the transcript; never invent content.';
      break;
    case 'in-depth':
      body = 'Produce a thorough, detailed Markdown summary with these sections:\n'
        + '## Overview — 3-5 sentences on what the session covered\n'
        + '## At a Glance — a Markdown table (| Topic | Key idea |) with 4-8 rows giving a visual overview of the session\n'
        + '## Key Points — 6-10 bullets, each with a short explanation\n'
        + '## Key Terms — every important term/vocabulary item with a clear one-to-two-line definition\n'
        + '## Examples — describe each example or worked problem and what it demonstrates\n'
        + '## Follow-ups — all homework, reminders or next steps, including any deadlines mentioned\n'
        + 'Where the transcript shows a calculation or process, lay out its steps (a numbered list or table is fine). '
        + 'Use markdown tables where they make the content clearer. '
        + 'Use only facts from the transcript; never invent content.';
      break;
    default:
      body = 'Produce a Markdown summary with exactly these sections:\n'
        + '## Overview — 2-3 sentences on what the session covered\n'
        + '## At a Glance — a Markdown table (| Topic | Key idea |) with 3-6 rows summarising the session at a glance\n'
        + '## Key Points — the main teaching points, as bullets\n'
        + '## Key Terms — important terms/vocabulary with a one-line definition each\n'
        + '## Examples — examples or worked problems that came up, briefly\n'
        + '## Follow-ups — homework, reminders or next steps, if any were mentioned '
        + '(omit the section if there were none)\n'
        + 'Use markdown tables where they make the content clearer. '
        + 'Use only facts from the transcript; never invent content.';
  }
  return chat([{ role: 'system', content: intro + body }, { role: 'user', content: `Session transcript:\n\n${transcript}` }], 4000);
}

function summarizeMinutes(transcript: string, rule: string, length: SummaryLength): Promise<string> {
  const intro = 'You are a professional secretary who writes minutes from session transcripts. '
    + `Write everything in ${rule}\n`;
  let body: string;
  switch (length) {
    case 'brief':
      body = 'Produce a concise Markdown meeting minute with these sections:\n'
        + '## Overview — 1-2 sentences on what the meeting was about and its outcome\n'
        + '## Decisions — the key decisions made, as bullets (omit the section if none)\n'
        + '## Action Items — task — owner — deadline, one line each (omit the section if none)\n'
        + 'Keep the whole minute under 150 words. '
        + 'Use only facts from the transcript; never invent content.';
      break;
    case 'in-depth':
      body = 'Produce a thorough, detailed Markdown meeting minute with these sections:\n'
        + '## Overview — 3-5 sentences on the meeting\'s purpose, scope and outcome\n'
        + '## Topics Discussed — each topic with a short account of what was said\n'
        + '## Decisions — each decision with its rationale, as bullets\n'
        + '## Action Items — a Markdown table (| Task | Owner | Deadline |) listing every action item, with each task, its owner and its deadline where stated\n'
        + '## Open Questions — items left unresolved or deferred (omit the section if none)\n'
        + 'Where the transcript shows numbers, budgets or schedules, record them exactly. '
        + 'Name participants only if the transcript identifies them. '
        + 'Use only facts from the transcript; never invent content.';
      break;
    default:
      body = 'Produce a Markdown meeting minute with exactly these sections:\n'
        + '## Overview — 2-3 sentences on the meeting\'s purpose and outcome\n'
        + '## Topics Discussed — the main points raised, as bullets\n'
        + '## Decisions — what was agreed, as bullets (omit the section if none)\n'
        + '## Action Items — a Markdown table (| Task | Owner | Deadline |) of the action items mentioned '
        + '(omit the section if none)\n'
        + 'Name participants only if the transcript identifies them. '
        + 'Use only facts from the transcript; never invent content.';
  }
  return chat([{ role: 'system', content: intro + body }, { role: 'user', content: `Session transcript:\n\n${transcript}` }], 4000);
}

// ---------------------------------------------------------------------------
// Transcript translation
// ---------------------------------------------------------------------------

export async function translateSegments(
  segments: TranscriptSegment[],
  target: OutputLanguage,
): Promise<TranscriptSegment[]> {
  const rule = languageRule(target);
  const system = `You translate transcript segments. Translate each segment's text into ${rule}. `
    + 'Keep the meaning, tone and terminology consistent. Output STRICT JSON only — no markdown '
    + 'fences, no commentary — as an array of objects {"start": number, "end": number, "text": string}, '
    + 'one object per input segment, in the same order, with the same start and end values and only '
    + 'the text translated.';
  const input = segments.map((s) => ({ start: s.start, end: s.end, text: s.text }));
  const raw = await chat(
    [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(input) }],
    8000,
  );
  return parseTranslatedSegments(raw, segments);
}

function parseTranslatedSegments(raw: string, original: TranscriptSegment[]): TranscriptSegment[] {
  let payload = raw;
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start !== -1 && end > start) payload = raw.slice(start, end + 1);
  let items: unknown;
  try {
    items = JSON.parse(payload);
  } catch {
    throw new ApiError('The model did not return valid translation JSON. Try again.');
  }
  if (!Array.isArray(items)) {
    throw new ApiError('The model did not return valid translation JSON. Try again.');
  }
  const arr = items as Array<Record<string, unknown>>;
  let translated = 0;
  // Keep the original timestamps; only trust the model for the text, matched by index.
  const out = original.map((seg, i) => {
    const text = typeof arr[i]?.text === 'string' ? (arr[i].text as string).trim() : '';
    if (text) translated += 1;
    return { start: seg.start, end: seg.end, text: text || seg.text };
  });
  if (translated < Math.max(1, Math.floor(original.length / 2))) {
    throw new ApiError('The model returned too few translated segments. Try again.');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------

export async function makeQuiz(
  transcript: string,
  lang: OutputLanguage,
  count: number,
): Promise<QuizQuestion[]> {
  const n = Math.max(1, Math.min(count, 20));
  const rule = languageRule(lang);
  const system = 'You are a teacher who writes multiple-choice quizzes from session transcripts. '
    + `Write all questions, options and explanations in ${rule}\n`
    + `Create exactly ${n} multiple-choice questions that test understanding of `
    + 'the session content. Questions must be answerable from the transcript alone, '
    + 'with mixed difficulty and plausible distractors.\n'
    + 'Output STRICT JSON only — no markdown fences, no commentary. Format: an array '
    + 'of objects {"question": string, "options": [exactly 4 strings], '
    + '"answer": integer 0-3 (index of the correct option), "explanation": 1-2 '
    + 'sentence explanation of why the answer is correct}';
  const raw = await chat(
    [{ role: 'system', content: system }, { role: 'user', content: `Session transcript:\n\n${transcript}` }],
    8000,
  );
  return parseQuiz(raw);
}

/** Tolerate fenced/narrated output: take the outermost [...] span. */
export function parseQuiz(raw: string): QuizQuestion[] {
  let payload = raw;
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start !== -1 && end > start) payload = raw.slice(start, end + 1);

  let items: unknown;
  try {
    items = JSON.parse(payload);
  } catch {
    throw new ApiError('The model did not return valid quiz JSON. Try again, or switch the model in .env.');
  }
  if (!Array.isArray(items)) {
    throw new ApiError('The model did not return valid quiz JSON. Try again, or switch the model in .env.');
  }

  const questions: QuizQuestion[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const q = item as Record<string, unknown>;
    const question = typeof q.question === 'string' ? q.question.trim() : '';
    const options = Array.isArray(q.options) ? q.options : [];
    const answer = q.answer;
    if (!question) continue;
    if (options.length !== 4) continue;
    if (!options.every((o) => typeof o === 'string' && o.trim() !== '')) continue;
    if (typeof answer !== 'number' || answer < 0 || answer > 3) continue;
    const explanation = typeof q.explanation === 'string' ? q.explanation.trim() : '';
    questions.push({
      question,
      options: options.map((o) => (o as string).trim()),
      answer,
      explanation,
    });
  }
  if (questions.length < 3) {
    throw new ApiError('The model returned too few valid questions. Try again.');
  }
  return questions;
}

// ---------------------------------------------------------------------------
// Chat transport
// ---------------------------------------------------------------------------

interface Message {
  role: string;
  content: string;
}

async function chat(messages: Message[], maxTokens: number): Promise<string> {
  if (!config.openRouterApiKey) {
    throw new ApiError('OpenRouter API key is missing — set OPENROUTER_API_KEY in .env.');
  }
  const data = await postJson(CHAT_URL, {
    model: config.openRouterModel,
    messages,
    max_tokens: maxTokens,
  });
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content) {
    throw new ApiError('OpenRouter returned an unexpected response.');
  }
  return content;
}

async function postJson(url: string, body: unknown): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000); // LLM calls can take minutes
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: any) {
    throw new ApiError(`Could not reach OpenRouter: ${err?.message ?? err}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) throw new ApiError('OpenRouter rejected the API key (401). Check OPENROUTER_API_KEY in .env.');
  if (res.status === 402) throw new ApiError('OpenRouter account is out of credits (402).');
  if (res.status === 408 || res.status === 429) throw new ApiError(`OpenRouter error (${res.status}): request timed out or rate-limited — try again.`);
  if (res.status >= 400) {
    const snippet = (await res.text().catch(() => '')).slice(0, 300);
    throw new ApiError(`OpenRouter error (${res.status}): ${snippet}`);
  }
  return res.json();
}
