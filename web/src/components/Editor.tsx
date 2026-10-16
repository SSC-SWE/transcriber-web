import { useCallback, useEffect, useRef, useState } from 'react';
import { formatTimestamp } from '../format';
import { Icon } from '../icons';
import type { TranscriptSegment } from '../types';

// The Plaud/Label-Studio-style editor: audio player + waveform on the left,
// timestamped transcript on the right, two-way synced. Clicking a line seeks
// the audio; clicking the waveform seeks too; the active line follows playback.
//
// The audio is played from the file the user dropped, held in the browser's
// memory (a blob URL). The server never stores audio — it only holds the bytes
// long enough to transcribe them — so once the tab is closed or reloaded there
// is nothing left to play and the editor degrades to transcript-only.

interface Props {
  /** Blob URL of the uploaded file (present only during the current tab session). */
  src?: string;
  segments: TranscriptSegment[];
  /** Translated copy (same timestamps), shown beneath each original line. */
  translated?: TranscriptSegment[] | null;
}

export default function Editor({ src, segments, translated }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Decode the audio to compute waveform peaks + duration.
  useEffect(() => {
    if (!src) {
      setPeaks([]);
      setDuration(0);
      setCurrentTime(0);
      setPlaying(false);
      return;
    }
    let cancelled = false;
    let ctx: AudioContext | null = null;
    setPeaks([]);
    setDuration(0);
    setCurrentTime(0);
    setPlaying(false);
    audioRef.current?.pause();
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    fetch(src)
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx!.decodeAudioData(buf))
      .then((buffer) => {
        if (cancelled) return;
        const n = 300;
        const channel = buffer.getChannelData(0);
        const step = Math.max(1, Math.floor(channel.length / n));
        const out: number[] = [];
        for (let i = 0; i < n; i++) {
          let max = 0;
          const start = i * step;
          const end = Math.min(start + step, channel.length);
          for (let j = start; j < end; j += 16) {
            const v = Math.abs(channel[j]);
            if (v > max) max = v;
          }
          out.push(max);
        }
        setPeaks(out);
        setDuration(buffer.duration);
      })
      .catch(() => {
        // Unsupported codec — waveform falls back to a plain seek bar.
      })
      .finally(() => ctx?.close().catch(() => {}));
    return () => {
      cancelled = true;
      ctx?.close().catch(() => {});
    };
  }, [src]);

  // Draw the waveform (or a plain seek bar when decoding failed).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const playhead = duration > 0 ? currentTime / duration : 0;

    if (peaks.length > 0) {
      const barW = w / peaks.length;
      for (let i = 0; i < peaks.length; i++) {
        const barH = Math.max(2, peaks[i] * h * 0.92);
        const x = i * barW;
        const played = i / peaks.length <= playhead;
        g.fillStyle = played ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.22)';
        g.fillRect(x + 0.5, (h - barH) / 2, Math.max(1, barW - 1), barH);
      }
    } else {
      const y = h / 2;
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(255,255,255,0.2)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(3, y);
      g.lineTo(w - 3, y);
      g.stroke();
      if (duration > 0) {
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.beginPath();
        g.moveTo(3, y);
        g.lineTo(3 + (w - 6) * playhead, y);
        g.stroke();
      }
    }
  }, [peaks, currentTime, duration]);

  const seek = useCallback(
    (clientX: number) => {
      const canvas = canvasRef.current;
      const audio = audioRef.current;
      if (!canvas || !audio || !duration) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      audio.currentTime = ratio * duration;
      setCurrentTime(ratio * duration);
    },
    [duration],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, []);

  const jumpTo = useCallback(
    (index: number) => {
      const audio = audioRef.current;
      const seg = segments[index];
      if (!audio || !seg) return;
      audio.currentTime = Math.max(0, seg.start - 0.05);
      setCurrentTime(Math.max(0, seg.start - 0.05));
      void audio.play();
    },
    [segments],
  );

  // Track the active segment as playback progresses.
  useEffect(() => {
    let idx = -1;
    for (let i = 0; i < segments.length; i++) {
      if (currentTime >= segments[i].start && (i === segments.length - 1 || currentTime < segments[i].end)) {
        idx = i;
        break;
      }
    }
    setActiveIndex((prev) => (prev === idx ? prev : idx));
  }, [currentTime, segments]);

  useEffect(() => {
    if (activeIndex >= 0 && rowRefs.current[activeIndex]) {
      rowRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeIndex]);

  // Keyboard shortcuts: Space play/pause, ↑/↓ previous/next line.
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowDown' && segments.length) {
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = Math.min(segments.length - 1, prev + 1);
          jumpTo(next);
          return next;
        });
      } else if (e.key === 'ArrowUp' && segments.length) {
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = Math.max(0, prev - 1);
          jumpTo(next);
          return next;
        });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [src, togglePlay, jumpTo, segments.length]);

  const transcript = segments.length === 0 ? (
    <div className="empty-state">No transcript yet.</div>
  ) : (
    segments.map((seg, i) => (
      <div
        key={`${seg.start}-${i}`}
        ref={(el) => {
          rowRefs.current[i] = el;
        }}
        className={`segment ${i === activeIndex ? 'active' : ''}`}
        onClick={() => jumpTo(i)}
      >
        <span className="segment-time">{formatTimestamp(seg.start)}</span>
        <div className="segment-text">
          <div className="segment-original">{seg.text}</div>
          {translated?.[i] && <div className="segment-translated">{translated[i].text}</div>}
        </div>
      </div>
    ))
  );

  if (!src) {
    return (
      <div>
        {segments.length > 0 && (
          <p className="hint" style={{ margin: '0 0 10px' }}>
            Audio is used for transcription only and isn’t kept — the player is available only
            while the original file is still in this tab.
          </p>
        )}
        <div className="transcript">{transcript}</div>
      </div>
    );
  }

  return (
    <div className="editor">
      <div className="editor-audio">
        <div className="audio-card">
          <audio
            ref={audioRef}
            src={src}
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => {
              if (!duration) setDuration(e.currentTarget.duration);
            }}
          />
          <canvas ref={canvasRef} className="waveform" onClick={(e) => seek(e.clientX)} />
          <div className="audio-controls">
            <button className="play-btn" onClick={togglePlay} title="Play / pause (Space)">
              <Icon name={playing ? 'pause' : 'play'} size={16} />
            </button>
            <span className="audio-time">
              {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
            </span>
          </div>
          <p className="audio-hint">Click the waveform to jump · click a line to play from there · Space · ↑ · ↓</p>
        </div>
      </div>

      <div className="transcript">{transcript}</div>
    </div>
  );
}
