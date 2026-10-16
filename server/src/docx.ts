// Word (.docx) export — a faithful port of the mac app's DocxWriter.swift
// (which is itself a port of the original PHP src/Docx.php): the same hand-built
// minimal OOXML package, the same styles and heading/bullet/bold/code mapping,
// so the .docx files look identical to the ones the native app produces.

import JSZip from 'jszip';

export function buildDocx(kind: 'transcript' | 'summary', text: string, title: string): Promise<Buffer> {
  const body = kind === 'transcript' ? transcriptBody(text, title) : summaryBody(text, title);

  const parts: Record<string, string> = {
    '[Content_Types].xml': contentTypes(),
    '_rels/.rels': rootRels(),
    'word/document.xml': document(body),
    'word/_rels/document.xml.rels': documentRels(),
    'word/styles.xml': styles(),
    'word/numbering.xml': numbering(),
  };

  const zip = new JSZip();
  for (const [name, content] of Object.entries(parts)) zip.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ---------------------------------------------------------------------------
// Content assembly
// ---------------------------------------------------------------------------

function transcriptBody(text: string, title: string): string {
  const display = title || 'Session';
  const out = [heading('Title', `Transcript — ${display}`)];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.includes(']')) {
      const close = line.indexOf(']');
      const ts = line.slice(1, close);
      const rest = line.slice(close + 1);
      out.push(paragraph('Normal', [run(`[${ts}] `, 'bold'), ...inlineRuns(rest)]));
    } else {
      out.push(paragraph('Normal', inlineRuns(line)));
    }
  }
  return out.join('');
}

function summaryBody(text: string, title: string): string {
  const display = title || 'Session';
  const out = [heading('Title', `Session Summary — ${display}`)];
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1].trim())) {
      const rows = [splitRow(line)];
      i += 2;
      while (i < lines.length && isTableRow(lines[i].trim())) {
        rows.push(splitRow(lines[i].trim()));
        i += 1;
      }
      out.push(tableBlock(rows));
      continue;
    }
    if (line.startsWith('### ')) out.push(heading('Heading2', plain(line.slice(4))));
    else if (line.startsWith('## ')) out.push(heading('Heading1', plain(line.slice(3))));
    else if (line.startsWith('# ')) out.push(heading('Heading1', plain(line.slice(2))));
    else if (line.startsWith('- ') || line.startsWith('* ')) out.push(paragraph('ListParagraph', inlineRuns(line.slice(2)), 1));
    else out.push(paragraph('Normal', inlineRuns(line)));
    i += 1;
  }
  return out.join('');
}

// --- Markdown table support -------------------------------------------------

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

/** Minimal OOXML table — first row is the bold header. */
function tableBlock(rows: string[][]): string {
  const cols = rows[0]?.length ?? 1;
  const grid = `<w:tblGrid>${Array.from({ length: cols }, () => '<w:gridCol w:w="2400"/>').join('')}</w:tblGrid>`;
  const borders =
    '<w:tblBorders>'
    + '<w:top w:val="single" w:sz="4" w:color="999999"/>'
    + '<w:left w:val="single" w:sz="4" w:color="999999"/>'
    + '<w:bottom w:val="single" w:sz="4" w:color="999999"/>'
    + '<w:right w:val="single" w:sz="4" w:color="999999"/>'
    + '<w:insideH w:val="single" w:sz="4" w:color="999999"/>'
    + '<w:insideV w:val="single" w:sz="4" w:color="999999"/>'
    + '</w:tblBorders>';
  const tblPr = `<w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}</w:tblPr>`;
  const trs = rows
    .map((row, ri) => {
      const cells = row
        .map((cell) => {
          const content = ri === 0 ? [run(cell, 'bold')] : inlineRuns(cell);
          return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${paragraph('Normal', content)}</w:tc>`;
        })
        .join('');
      return `<w:tr>${cells}</w:tr>`;
    })
    .join('');
  return `<w:tbl>${tblPr}${grid}${trs}</w:tbl>`;
}

/** Renders **bold** and `code` spans into runs. */
function inlineRuns(markdown: string): string[] {
  const runs: string[] = [];
  let plainText = '';
  let i = 0;
  while (i < markdown.length) {
    if (markdown.startsWith('**', i)) {
      const close = markdown.indexOf('**', i + 2);
      if (close !== -1) {
        if (plainText) { runs.push(run(plainText)); plainText = ''; }
        runs.push(run(markdown.slice(i + 2, close), 'bold'));
        i = close + 2;
        continue;
      }
    }
    if (markdown[i] === '`') {
      const close = markdown.indexOf('`', i + 1);
      if (close !== -1) {
        if (plainText) { runs.push(run(plainText)); plainText = ''; }
        runs.push(run(markdown.slice(i + 1, close), 'code'));
        i = close + 1;
        continue;
      }
    }
    plainText += markdown[i];
    i += 1;
  }
  if (plainText) runs.push(run(plainText));
  return runs;
}

function plain(markdown: string): string {
  let text = markdown;
  let idx = text.indexOf('**');
  while (idx !== -1) {
    const close = text.indexOf('**', idx + 2);
    if (close === -1) break;
    text = text.slice(0, idx) + text.slice(idx + 2, close) + text.slice(close + 2);
    idx = text.indexOf('**');
  }
  return text.replace(/`/g, '');
}

// ---------------------------------------------------------------------------
// XML fragments
// ---------------------------------------------------------------------------

function esc(text: string): string {
  const cleaned = [...text]
    .filter((ch) => !(ch.charCodeAt(0) < 0x20 && ch !== '\t' && ch !== '\n' && ch !== '\r'))
    .join('');
  return cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function run(text: string, type: 'plain' | 'bold' | 'code' = 'plain'): string {
  const rpr =
    type === 'bold' ? '<w:rPr><w:b/></w:rPr>'
    : type === 'code' ? '<w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/></w:rPr>'
    : '';
  return `<w:r>${rpr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function paragraph(style: string, runs: string[], numId?: number): string {
  const num = numId
    ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`
    : '';
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${num}</w:pPr>${runs.join('')}</w:p>`;
}

function heading(style: string, text: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${run(text)}</w:p>`;
}

function document(body: string): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + `<w:body>${body}`
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
    + '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" '
    + 'w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'
    + '</w:body></w:document>';
}

function contentTypes(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
    + '</Types>';
}

function rootRels(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>';
}

function documentRels(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
    + '</Relationships>';
}

function styles(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:docDefaults><w:rPrDefault><w:rPr>'
    + '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/>'
    + '</w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/>'
    + '<w:pPr><w:spacing w:after="240"/></w:pPr>'
    + '<w:rPr><w:b/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/>'
    + '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>'
    + '<w:rPr><w:b/><w:color w:val="2F5496"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/>'
    + '<w:pPr><w:keepNext/><w:spacing w:before="180" w:after="90"/><w:outlineLvl w:val="1"/></w:pPr>'
    + '<w:rPr><w:b/><w:color w:val="2F5496"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/>'
    + '<w:pPr><w:spacing w:after="60"/><w:contextualSpacing/></w:pPr></w:style>'
    + '</w:styles>';
}

function numbering(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>'
    + '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#xF0B7;"/><w:lvlJc w:val="left"/>'
    + '<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>'
    + '<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl>'
    + '</w:abstractNum>'
    + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'
    + '</w:numbering>';
}
