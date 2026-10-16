import { useEffect, useState } from 'react';
import { Spinner } from './ui';

export type OverlayKind = 'summary' | 'quiz';
export type OverlayPhase = 'auth' | 'working' | 'authFailed';

export interface OverlayState {
  kind: OverlayKind;
  phase: OverlayPhase;
  error?: string;
}

interface Props {
  overlay: OverlayState;
  onCancel: () => void;
  onRetry: () => void;
}

const STEPS: Record<OverlayKind, string[]> = {
  summary: [
    'Reading the transcript…',
    'Picking out the key ideas…',
    'Structuring the summary…',
    'Polishing the wording…',
    'Still working — long sessions take a little longer…',
  ],
  quiz: [
    'Drafting the questions…',
    'Writing the answer key…',
    'Checking every question…',
    'Creating the Google Form…',
    'Marking the correct answers…',
  ],
};

export default function AIOverlay({ overlay, onCancel, onRetry }: Props) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    setStepIndex(0);
  }, [overlay.phase, overlay.kind]);

  useEffect(() => {
    if (overlay.phase !== 'working') return;
    const id = setInterval(() => setStepIndex((i) => i + 1), 2600);
    return () => clearInterval(id);
  }, [overlay.phase]);

  const steps = STEPS[overlay.kind];
  const step = steps[stepIndex % steps.length];

  return (
    <div className="overlay">
      <div className="overlay-card" role="status" aria-live="polite">
        <Spinner />
        <div className="overlay-title">
          {overlay.kind === 'summary' ? 'AI Summary' : 'Google Form Quiz'}
        </div>
        {overlay.phase === 'auth' && (
          <>
            <p className="overlay-step">
              Waiting for Google — approve access in the pop-up. Closed it by accident? Click Try
              Again.
            </p>
            <div className="overlay-actions">
              <button className="btn btn-primary" onClick={onRetry}>
                Try Again
              </button>
              <button className="btn" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </>
        )}
        {overlay.phase === 'authFailed' && (
          <>
            <p className="overlay-step">Sign-in didn’t complete.</p>
            {overlay.error && <p className="overlay-error">{overlay.error}</p>}
            <div className="overlay-actions">
              <button className="btn btn-primary" onClick={onRetry}>
                Try Again
              </button>
              <button className="btn" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </>
        )}
        {overlay.phase === 'working' && (
          <>
            <p className="overlay-step">{step}</p>
            <div className="overlay-track">
              <div className="overlay-pill" />
            </div>
            <div className="overlay-actions">
              <button className="btn" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
