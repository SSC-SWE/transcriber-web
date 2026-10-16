import { useCallback, useEffect, useState } from 'react';
import * as api from './api';
import type { Health } from './api';
import NewSession from './components/NewSession';
import SessionDetail from './components/SessionDetail';
import SettingsView from './components/Settings';
import Sidebar, { type View } from './components/Sidebar';
import { useSettings } from './settings';
import type { Job, Session, SessionSummary } from './types';

export default function App() {
  const [view, setView] = useState<View>({ kind: 'new' });
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [search, setSearch] = useState('');
  const [pendingJob, setPendingJob] = useState<{ sessionId: string; job: Job } | null>(null);
  const { settings, update } = useSettings();

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await api.listSessions());
    } catch {
      // server unreachable — the detail views surface their own errors
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    api.getHealth().then(setHealth).catch(() => {});
  }, []);

  const handleCreated = (session: Session, job: Job) => {
    setPendingJob({ sessionId: session.id, job });
    void refreshSessions();
    setView({ kind: 'session', id: session.id });
  };

  const handleRename = async (id: string, name: string) => {
    try {
      await api.renameSession(id, name);
      void refreshSessions();
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    await api.deleteSession(id);
    void refreshSessions();
    if (view.kind === 'session' && view.id === id) setView({ kind: 'new' });
  };

  return (
    <div className="app">
      <Sidebar
        view={view}
        sessions={sessions}
        search={search}
        setSearch={setSearch}
        onSettings={() => setView({ kind: 'settings' })}
        onNew={() => setView({ kind: 'new' })}
        onOpen={(id) => {
          setPendingJob(null);
          setView({ kind: 'session', id });
        }}
        onRename={handleRename}
        onDelete={handleDelete}
      />
      <main className="main">
        {view.kind === 'settings' && <SettingsView settings={settings} update={update} />}
        {view.kind === 'new' && <NewSession settings={settings} onCreated={handleCreated} />}
        {view.kind === 'session' && (
          <SessionDetail
            key={view.id}
            id={view.id}
            initialJob={pendingJob && pendingJob.sessionId === view.id ? pendingJob.job : null}
            settings={settings}
            googleConfigured={health?.google.configured ?? false}
            onChanged={() => void refreshSessions()}
            onDeleted={() => void handleDelete(view.id)}
          />
        )}
      </main>
    </div>
  );
}
