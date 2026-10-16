import { useEffect, useState } from 'react';
import { formatClock } from '../format';
import type { Job } from '../types';
import { Card } from './ui';

export default function ProgressCard({ job }: { job: Job }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = new Date(job.createdAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [job.createdAt]);

  const indeterminate = job.progress === null;

  return (
    <Card>
      <div className="progress-row">
        <span className="progress-stage">{job.stage}</span>
        <span className="progress-meta">
          <span>{formatClock(elapsed)}</span>
          <span style={{ width: 44, textAlign: 'right' }}>
            {indeterminate ? '…' : `${Math.round(job.progress ?? 0)}%`}
          </span>
        </span>
      </div>
      <div className={`bar ${indeterminate ? 'bar-indeterminate' : ''}`}>
        <div
          className="bar-fill"
          style={indeterminate ? undefined : { width: `${job.progress}%` }}
        />
      </div>
    </Card>
  );
}
