import type { ReactNode } from 'react';

// Tiny, safe Markdown renderer for the AI summary — headings, bullets,
// **bold**, `code`, and (Github-style) tables. Everything is escaped first, so
// model output can never inject HTML.

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

function isTableRow(line: string): boolean {
  return line.startsWith('|') && line.includes('|', 1);
}

function isTableSeparator(line: string): boolean {
  return /^\|(\s*:?-+:?\s*\|)+\s*$/.test(line);
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

export function renderMarkdown(markdown: string): ReactNode[] {
  const lines = markdown.split('\n');
  const nodes: ReactNode[] = [];
  let key = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1].trim())) {
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i].trim())) {
        rows.push(splitRow(lines[i].trim()));
        i += 1;
      }
      nodes.push(
        <table className="md-table" key={key++}>
          <thead>
            <tr>
              {header.map((cell, ci) => (
                <th key={ci}>{inline(cell, `th${ci}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>{inline(cell, `c${ri}-${ci}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
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
    i += 1;
  }
  return nodes;
}

/** Markdown → plain HTML string, for the client-side PDF print view. */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const blocks: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1].trim())) {
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i].trim())) {
        rows.push(splitRow(lines[i].trim()));
        i += 1;
      }
      const cell = (t: string) => `<td>${escapeHtml(t)}</td>`;
      const th = (t: string) => `<th>${escapeHtml(t)}</th>`;
      blocks.push(
        `<table><thead><tr>${header.map(th).join('')}</tr></thead><tbody>`
          + rows.map((r) => `<tr>${r.map(cell).join('')}</tr>`).join('')
          + '</tbody></table>',
      );
      continue;
    }
    if (line.startsWith('### ')) blocks.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    else if (line.startsWith('## ')) blocks.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    else if (line.startsWith('# ')) blocks.push(`<h2>${escapeHtml(line.slice(2))}</h2>`);
    else if (line.startsWith('- ') || line.startsWith('* ')) blocks.push(`<li>${escapeHtml(line.slice(2))}</li>`);
    else blocks.push(`<p>${escapeHtml(line)}</p>`);
    i += 1;
  }
  // Wrap consecutive <li> in <ul>.
  const out: string[] = [];
  let listOpen = false;
  for (const b of blocks) {
    if (b.startsWith('<li>')) {
      if (!listOpen) {
        out.push('<ul>');
        listOpen = true;
      }
      out.push(b);
    } else {
      if (listOpen) {
        out.push('</ul>');
        listOpen = false;
      }
      out.push(b);
    }
  }
  if (listOpen) out.push('</ul>');
  return out.join('\n');
}
