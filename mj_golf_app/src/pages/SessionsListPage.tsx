import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Pencil, Trash2 } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useAllSessions, updateSession, deleteSession } from '../hooks/useSessions';
import { useAllClubs } from '../hooks/useClubs';
import type { Session } from '../models/session';

export function SessionsListPage() {
  const navigate = useNavigate();
  const sessions = useAllSessions();
  const clubs = useAllClubs();

  const clubMap = new Map(clubs?.map((c) => [c.id, c.name]) ?? []);

  // Edit modal state
  const [editSession, setEditSession] = useState<Session | null>(null);
  const [editClubId, setEditClubId] = useState('');
  const [editDate, setEditDate] = useState('');

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);

  const openEdit = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditClubId(session.clubId ?? '');
    setEditDate(new Date(session.date).toISOString().split('T')[0]);
    setEditSession(session);
  };

  const handleSave = async () => {
    if (!editSession) return;
    const updates: { clubId?: string; date?: number } = {};
    if (editClubId !== editSession.clubId) updates.clubId = editClubId;
    const newDate = new Date(editDate + 'T00:00:00').getTime();
    if (newDate !== editSession.date) updates.date = newDate;
    if (Object.keys(updates).length > 0) {
      await updateSession(editSession.id, updates);
    }
    setEditSession(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteSession(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <>
      <TopBar title="All Practice Rounds" showBack />
      <div className="px-4 py-4">
        {!sessions || sessions.length === 0 ? (
          <div className="rounded-2xl border border-border p-8 text-center text-sm text-text-muted">
            No sessions yet.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => navigate(`/session/${session.id}`)}
                className="flex items-center justify-between rounded-2xl border border-border bg-card shadow-sm p-3 text-left transition-all duration-200 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-px"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text-dark">
                    {session.type === 'wedge-distance' ? 'Wedge Practice' : session.type === 'interleaved' ? 'Interleaved Practice' : clubMap.get(session.clubId ?? '') || 'Unknown Club'}
                  </div>
                  <div className="text-xs text-text-muted">
                    {new Date(session.date).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                    {session.location && ` · ${session.location}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right mr-2">
                    <div className="text-sm text-text-medium">{session.shotCount} shots</div>
                    <div className="text-[10px] text-text-faint capitalize">{session.source}</div>
                  </div>
                  <button
                    onClick={(e) => openEdit(session, e)}
                    className="rounded-lg p-1.5 text-text-muted hover:bg-surface hover:text-text-dark"
                    aria-label="Edit session"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(session);
                    }}
                    className="rounded-lg p-1.5 text-text-muted hover:bg-surface hover:text-coral"
                    aria-label="Delete session"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Modal open={!!editSession} onClose={() => setEditSession(null)} title="Edit Session">
        <div className="flex flex-col gap-4">
          <Select
            label="Club"
            value={editClubId}
            onChange={(e) => setEditClubId(e.target.value)}
            options={(clubs ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <Input
            label="Date"
            type="date"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
          />
          <Button onClick={handleSave} className="w-full">
            Save
          </Button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Session">
        <p className="mb-4 text-sm text-text-medium">
          Delete the{' '}
          <span className="font-semibold text-text-dark">
            {deleteTarget ? (deleteTarget.type === 'wedge-distance' ? 'Wedge Practice' : clubMap.get(deleteTarget.clubId ?? '') || 'Unknown Club') : ''}
          </span>{' '}
          session ({deleteTarget?.shotCount} shots)? This cannot be undone.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)} className="flex-1">
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete} className="flex-1">
            Delete
          </Button>
        </div>
      </Modal>
    </>
  );
}
