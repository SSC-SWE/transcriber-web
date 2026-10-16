import { exportUrl } from '../api';
import { Icon } from '../icons';
import { printHtml } from '../print';

function copy(text: string): void {
  void navigator.clipboard.writeText(text);
}

interface Props {
  sessionId: string;
  kind: 'transcript' | 'summary';
  copyText: string;
  pdfTitle: string;
  pdfBodyHtml: string;
}

/** Word / PDF / TXT / Copy — the export row shared by transcript and summary. */
export default function ExportButtons({ sessionId, kind, copyText, pdfTitle, pdfBodyHtml }: Props) {
  return (
    <div className="export-row">
      <a
        className="btn btn-sm"
        href={exportUrl(sessionId, kind, 'docx')}
        title="Download Word (.docx)"
      >
        <Icon name="doc" size={14} /> Word
      </a>
      <button
        className="btn btn-sm"
        onClick={() => printHtml(pdfTitle, pdfBodyHtml)}
        title="Save as PDF (opens the print dialog)"
      >
        <Icon name="pdf" size={14} /> PDF
      </button>
      <a className="btn btn-sm" href={exportUrl(sessionId, kind, 'txt')} title="Download text (.txt)">
        <Icon name="txt" size={14} /> TXT
      </a>
      <button className="btn btn-sm" onClick={() => copy(copyText)} title="Copy to clipboard">
        <Icon name="copy" size={14} /> Copy
      </button>
    </div>
  );
}
