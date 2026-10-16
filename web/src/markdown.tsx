import type { ReactNode } from 'react';

// Tiny, safe Markdown renderer for the AI summary — the same subset the mac
// app handles: # / ## / ### headings, - and * bullets, **bold** and `code`.
// Everything is escaped first, so model output can never inject HTML.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  const escaped = escapeHtml(text);
  const nodes: ReactNode[] = [];
  const parts = escaped.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  let i = 0;
  for (const part of parts) {
    if (part === '') continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      nodes.push(<strong key={`${keyPrefix}-${i++}`}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      nodes.push(<code key={`${keyPrefix}-${i++}`}>{part.slice(1, -1)}</code>);
    } else {
      nodes.push(part);
    }
  }
  return nodes;
}

export function renderMarkdown(markdown: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let key = 0;
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('### ')) {
      nodes.push(<h3 key={key++}>{inline(line.slice(4), 'h3')}</h3>);
    } else if (line.startsWith('## ')) {
      nodes.push(<h2 key={key++}>{inline(line.slice(3), 'h2')}</h2>);
    } else if (line.startsWith('# ')) {
      nodes.push(<h2 key={key++}>{inline(line.slice(2), 'h1')}</h2>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      nodes.push(
        <div className="md-bullet" key={key++}>
          <span className="md-bullet-dot">•</span>
          <span>{inline(line.slice(2), `b${key}`)}</span>
        </div>,
      );
    } else {
      nodes.push(<p key={key++}>{inline(line, `p${key}`)}</p>);
    }
  }
  return nodes;
}

/** Markdown → plain HTML string, for the client-side PDF print view. */
export function markdownToHtml(markdown: string): string {
  const blocks: string[] = [];
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('### ')) blocks.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    else if (line.startsWith('## ')) blocks.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    else if (line.startsWith('# ')) blocks.push(`<h2>${escapeHtml(line.slice(2))}</h2>`);
    else if (line.startsWith('- ') || line.startsWith('* ')) blocks.push(`<li>${escapeHtml(line.slice(2))}</li>`);
    else blocks.push(`<p>${escapeHtml(line)}</p>`);
  }
  // Wrap consecutive <li> in <ul>.
  const out: string[] = [];
  let listOpen = false;
  for (const b of blocks) {
    if (b.startsWith('<li>')) {
      if (!listOpen) { out.push('<ul>'); listOpen = true; }
      out.push(b);
    } else {
      if (listOpen) { out.push('</ul>'); listOpen = false; }
      out.push(b);
    }
  }
  if (listOpen) out.push('</ul>');
  return out.join('\n');
}
