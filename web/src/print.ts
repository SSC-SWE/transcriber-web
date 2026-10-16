// Client-side PDF export: opens a clean print window and triggers the
// browser's print dialog (the user saves as PDF). Chosen over server-side PDF
// so Chinese/Cantonese text renders with the user's own system fonts and the
// server stays dependency-light.

export function printHtml(title: string, bodyHtml: string): void {
  const win = window.open('', '_blank', 'width=840,height=960');
  if (!win) {
    window.alert('Popup blocked — allow popups to export as PDF.');
    return;
  }
  const escapedTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapedTitle}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, "PingFang HK", "Noto Sans CJK TC", sans-serif; color: #000; padding: 44px; max-width: 760px; margin: 0 auto; line-height: 1.6; font-size: 13.5px; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 24px; }
  h2 { font-size: 16px; margin: 18px 0 6px; }
  h3 { font-size: 14px; margin: 14px 0 4px; }
  p { margin: 6px 0; }
  ul { margin: 6px 0; padding-left: 20px; }
  li { margin: 3px 0; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; background: #f0f0f0; border-radius: 4px; padding: 1px 5px; }
  table { border-collapse: collapse; margin: 10px 0; width: 100%; font-size: 13px; }
  th, td { border: 1px solid #ccc; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; }
  .line { margin: 3px 0; }
  .ts { font-weight: 700; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1>${escapedTitle}</h1>
<div class="meta">Exported from Transcriber · ${new Date().toLocaleString()}</div>
${bodyHtml}
<script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };<\/script>
</body>
</html>`);
  win.document.close();
}

export function transcriptHtml(lines: { start: number; text: string }[]): string {
  return lines
    .map((line) => `<div class="line"><span class="ts">[${formatPrintTs(line.start)}]</span> ${escapeHtml(line.text)}</div>`)
    .join('\n');
}

function formatPrintTs(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(mm)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
