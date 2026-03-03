import { useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { Trash2, Eraser } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  profilePicture?: string;
  role: 'admin' | 'player';
  handedness: 'left' | 'right';
  createdAt: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function UserManager() {
  const { data: users, mutate } = useSWR<UserRecord[]>('/api/users', fetcher);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'player' | 'admin'>('player');
  const [handedness, setHandedness] = useState<'left' | 'right'>('right');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [clearDataUser, setClearDataUser] = useState<UserRecord | null>(null);
  const [clearing, setClearing] = useState(false);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: JSON.stringify({ username, password, displayName: displayName || undefined, role, handedness }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create user');
        return;
      }

      setUsername('');
      setPassword('');
      setDisplayName('');
      setRole('player');
      setHandedness('right');
      setShowForm(false);
      mutate();
    } catch {
      setError('Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (userId: string) => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: { 'X-Requested-With': 'fetch' },
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to delete user');
      }
      setDeleteConfirm(null);
      mutate();
    } catch {
      setError('Failed to delete user');
    }
  };

  const handleClearData = async (userId: string) => {
    setClearing(true);
    try {
      const res = await fetch(`/api/users/${userId}/clear-data`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'fetch' },
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to clear data');
      }
      setClearDataUser(null);
    } catch {
      setError('Failed to clear data');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-dark">Users</h2>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Add User'}
        </Button>
      </div>

      {error && <p className="text-sm text-coral">{error}</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-medium">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-dark outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-dark outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-medium">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-dark outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="Optional"
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-text-medium">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'player' | 'admin')}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-dark outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="player">Player</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-text-medium">Handedness</label>
              <select
                value={handedness}
                onChange={(e) => setHandedness(e.target.value as 'left' | 'right')}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-dark outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="right">Right</option>
                <option value="left">Left</option>
              </select>
            </div>
          </div>
          <Button type="submit" disabled={loading || !username || !password} className="w-full">
            {loading ? 'Creating...' : 'Create User'}
          </Button>
        </form>
      )}

      <div className="space-y-2">
        {users?.map((u) => (
          <div key={u.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-3">
              {u.profilePicture ? (
                <img src={u.profilePicture} alt="" className="h-8 w-8 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white flex-shrink-0">
                  {(u.displayName || u.username).slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-text-dark">
                  {u.displayName || u.username}
                  <span className="ml-2 text-xs text-text-muted">@{u.username}</span>
                </p>
                <p className="text-xs text-text-muted">
                  {u.role === 'admin' ? 'Admin' : 'Player'}
                  {u.role === 'player' && ` · ${u.handedness === 'left' ? 'Left' : 'Right'}-handed`}
                  {u.email && ` · ${u.email}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {deleteConfirm === u.id ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDelete(u.id)}
                    className="text-xs font-medium text-coral hover:text-coral/80"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="text-xs font-medium text-text-muted hover:text-text-dark"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  {u.role === 'player' && (
                    <button
                      onClick={() => setClearDataUser(u)}
                      className="p-1.5 text-text-muted hover:text-amber-500 transition-colors"
                      title="Clear user data"
                    >
                      <Eraser size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteConfirm(u.id)}
                    className="p-1.5 text-text-muted hover:text-coral transition-colors"
                    title="Delete user"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={!!clearDataUser}
        onClose={() => setClearDataUser(null)}
        title="Clear User Data"
      >
        <p className="mb-4 text-sm text-text-medium">
          This will permanently delete all clubs, sessions, shots, and game plans for{' '}
          <strong>{clearDataUser?.displayName || clearDataUser?.username}</strong>. The user account will remain intact.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            variant="danger"
            onClick={() => clearDataUser && handleClearData(clearDataUser.id)}
            disabled={clearing}
            className="w-full"
          >
            {clearing ? 'Clearing...' : 'Clear All Data'}
          </Button>
          <Button variant="ghost" onClick={() => setClearDataUser(null)} className="w-full">
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
