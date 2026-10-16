import { useMemo, useRef, useState } from 'react';
import { displayName, formatDate, formatTimestamp } from '../format';
import { Icon } from '../icons';
import type { SessionSummary } from '../types';

export type View = { kind: 'settings' } | { kind: 'new' } | { kind: 'session'; id: string };

interface Props {
  view: View;
  sessions: SessionSummary[];
  search: string;
  setSearch: (value: string) => void;
  onSettings: () => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export default function Sidebar(props: Props) {
  const { view, sessions, search, setSearch } = props;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => displayName(s.filename).toLowerCase().includes(q));
  }, [sessions, search]);

  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        <SidebarItem
          icon="gear"
          title="Settings"
          active={view.kind === 'settings'}
          onClick={props.onSettings}
        />

        <div className="sidebar-search">
          <Icon name="search" size={14} />
          <input
            value={search}
            placeholder="Search sessions"
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="clear" onClick={() => setSearch('')} title="Clear search">
              <Icon name="x" size={13} />
            </button>
          )}
        </div>

        <SidebarItem
          icon="plus"
          title="New Session"
          active={view.kind === 'new'}
          onClick={props.onNew}
        />

        <div style={{ height: 6 }} />

        {filtered.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            active={view.kind === 'session' && view.id === session.id}
            onOpen={() => props.onOpen(session.id)}
            onRename={(name) => props.onRename(session.id, name)}
            onDelete={() => props.onDelete(session.id)}
          />
        ))}

        {filtered.length === 0 && (
          <div className="sidebar-empty">
            {search.trim() ? 'No matching sessions' : 'No Sessions Found'}
          </div>
        )}
      </div>

      <div className="sidebar-footer">Version 1.0.0</div>
    </aside>
  );
}

function SidebarItem({
  icon,
  title,
  active,
  onClick,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`sidebar-item ${active ? 'active' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <span className="sidebar-item-icon">
        <Icon name={icon} size={13} />
      </span>
      <span className="sidebar-item-body">
        <span className="sidebar-item-title" title={title}>
          {title}
        </span>
      </span>
    </div>
  );
}

function SessionRow({
  session,
  active,
  onOpen,
  onRename,
  onDelete,
}: {
  session: SessionSummary;
  active: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const subtitle = `${formatDate(session.createdAt)}${session.duration > 0 ? ` · ${formatTimestamp(session.duration)}` : ''}`;

  const handleRename = () => {
    setMenuOpen(false);
    setRenaming(true);
  };
  const handleDelete = () => {
    setMenuOpen(false);
    if (window.confirm(`Delete “${displayName(session.filename)}”? This removes the recording and transcript.`)) {
      onDelete();
    }
  };

  return (
    <div
      className={`sidebar-item ${active ? 'active' : ''} ${menuOpen ? 'menu-open' : ''}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span className="sidebar-item-icon">
        <Icon name="waveform" size={13} />
      </span>
      <span className="sidebar-item-body">
        <span className="sidebar-item-title" title={displayName(session.filename)}>
          {displayName(session.filename)}
        </span>
        <span className="sidebar-item-sub">{subtitle}</span>
      </span>
      <span
        className="sidebar-item-menu"
        role="button"
        tabIndex={0}
        aria-label="Session actions"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }
        }}
      >
        <Icon name="list" size={13} />
      </span>

      {menuOpen && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            right: 8,
            top: 30,
            background: '#242424',
            border: '1px solid var(--button-border)',
            borderRadius: 8,
            zIndex: 40,
            overflow: 'hidden',
            minWidth: 120,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem label="Rename…" onClick={handleRename} />
          <MenuItem label="Delete" danger onClick={handleDelete} />
        </div>
      )}

      {renaming && (
        <RenameModal
          initial={displayName(session.filename)}
          onCancel={() => setRenaming(false)}
          onSave={(name) => {
            setRenaming(false);
            if (name.trim()) onRename(name.trim());
          }}
        />
      )}
    </div>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: 'none',
        border: 0,
        color: danger ? 'var(--danger)' : 'var(--text)',
        padding: '7px 12px',
        fontSize: 13,
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function RenameModal({
  initial,
  onCancel,
  onSave,
}: {
  initial: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div
      className="modal-backdrop"
      onClick={onCancel}
      style={{ position: 'fixed', zIndex: 130 }}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Rename Session</div>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave(value);
            if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(value)} disabled={!value.trim()}>
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}
