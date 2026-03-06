import { useState, useEffect, type FormEvent } from 'react';
import useSWR from 'swr';
import { Trash2, Eraser, Pencil } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  hasProfilePicture?: boolean;
  role: 'admin' | 'player';
  handedness: 'left' | 'right';
  status: 'active' | 'pending' | 'rejected';
  createdAt: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Lazy-loads a user's profile picture from the separate endpoint */
function UserAvatar({ user }: { user: UserRecord }) {
  const { data } = useSWR<{ profilePicture: string | null }>(
    user.hasProfilePicture ? `/api/users/${user.id}/picture` : null,
    fetcher,
  );

  if (data?.profilePicture) {
    return <img src={data.profilePicture} alt="" className="h-8 w-8 rounded-full object-cover flex-shrink-0" />;
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white flex-shrink-0">
      {(user.displayName || user.username).slice(0, 2).toUpperCase()}
    </div>
  );
}

const inputClass = 'w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-text-dark outline-none focus:border-primary focus:ring-1 focus:ring-primary';

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
  const [deleting, setDeleting] = useState(false);
  const [clearDataUser, setClearDataUser] = useState<UserRecord | null>(null);
  const [clearing, setClearing] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);

  // Edit form state
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'player'>('player');
  const [editHandedness, setEditHandedness] = useState<'left' | 'right'>('right');
  const [editPassword, setEditPassword] = useState('');
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Populate edit form when user is selected
  useEffect(() => {
    if (editUser) {
      setEditDisplayName(editUser.displayName || '');
      setEditEmail(editUser.email || '');
      setEditRole(editUser.role);
      setEditHandedness(editUser.handedness);
      setEditPassword('');
      setEditError('');
    }
  }, [editUser]);

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
    setDeleting(true);
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
    } finally {
      setDeleting(false);
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

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setEditError('');
    setEditLoading(true);

    try {
      const body: Record<string, string | undefined> = {
        displayName: editDisplayName,
        email: editEmail || undefined,
        role: editRole,
        handedness: editHandedness,
      };
      if (editPassword) {
        body.password = editPassword;
      }

      const res = await fetch(`/api/users/${editUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setEditError(data.error || 'Failed to update user');
        return;
      }

      setEditUser(null);
      mutate();
    } catch {
      setEditError('Failed to update user');
    } finally {
      setEditLoading(false);
    }
  };

  const handleStatusChange = async (userId: string, status: 'active' | 'rejected') => {
    try {
      const res = await fetch(`/api/users/${userId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to update status');
      }
      mutate();
    } catch {
      setError('Failed to update status');
    }
  };

  const pendingUsers = users?.filter((u) => u.status === 'pending') || [];
  const activeUsers = users?.filter((u) => u.status !== 'pending') || [];

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
        <form onSubmit={handleCreate} className="rounded-sm border border-border bg-card p-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-medium">Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-medium">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-medium">Display Name</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} placeholder="Optional" />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-text-medium">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as 'player' | 'admin')} className={inputClass}>
                <option value="player">Player</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-text-medium">Handedness</label>
              <select value={handedness} onChange={(e) => setHandedness(e.target.value as 'left' | 'right')} className={inputClass}>
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

      {/* Pending Users */}
      {pendingUsers.length > 0 && (
        <div className="space-y-2">
          <p className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand">Pending Approval</p>
          {pendingUsers.map((u) => (
            <div key={u.id} className="flex items-center justify-between rounded-sm border border-gold/40 bg-gold/5 px-4 py-3">
              <div className="flex items-center gap-3">
                <UserAvatar user={u} />
                <div>
                  <p className="text-sm font-medium text-text-dark">
                    {u.displayName || u.username}
                    <span className="ml-2 text-xs text-text-muted">@{u.username}</span>
                  </p>
                  <p className="text-xs text-text-muted">
                    {u.email && `${u.email} · `}
                    Pending
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleStatusChange(u.id, 'active')}
                  className="rounded-sm bg-turf px-3 py-1.5 text-xs font-medium text-white hover:bg-fairway transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleStatusChange(u.id, 'rejected')}
                  className="rounded-sm border border-coral/40 px-3 py-1.5 text-xs font-medium text-coral hover:bg-coral/10 transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active Users */}
      <div className="space-y-2">
        {activeUsers.map((u) => (
          <div key={u.id} className="flex items-center justify-between rounded-sm border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-3">
              <UserAvatar user={u} />
              <div>
                <p className="text-sm font-medium text-text-dark">
                  {u.displayName || u.username}
                  <span className="ml-2 text-xs text-text-muted">@{u.username}</span>
                  {u.status === 'rejected' && (
                    <span className="ml-2 rounded-[6px] bg-coral/10 px-1.5 py-0.5 text-[10px] font-medium text-coral">Rejected</span>
                  )}
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
                    disabled={deleting}
                    className="text-xs font-medium text-coral hover:text-coral/80 disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    disabled={deleting}
                    className="text-xs font-medium text-text-muted hover:text-text-dark disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setEditUser(u)}
                    className="p-1.5 text-text-muted hover:text-primary transition-colors"
                    title="Edit user"
                  >
                    <Pencil size={16} />
                  </button>
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

      {/* Clear Data Modal */}
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

      {/* Edit User Modal */}
      <Modal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title={`Edit ${editUser?.displayName || editUser?.username}`}
      >
        <form onSubmit={handleEdit} className="space-y-3">
          {editError && <p className="text-sm text-coral">{editError}</p>}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-medium">Display Name</label>
            <input type="text" value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-medium">Email</label>
            <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className={inputClass} placeholder="Optional" />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-text-medium">Role</label>
              <select value={editRole} onChange={(e) => setEditRole(e.target.value as 'admin' | 'player')} className={inputClass}>
                <option value="player">Player</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-text-medium">Handedness</label>
              <select value={editHandedness} onChange={(e) => setEditHandedness(e.target.value as 'left' | 'right')} className={inputClass}>
                <option value="right">Right</option>
                <option value="left">Left</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-medium">New Password</label>
            <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className={inputClass} placeholder="Leave blank to keep current" />
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <Button type="submit" disabled={editLoading} className="w-full">
              {editLoading ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button variant="ghost" type="button" onClick={() => setEditUser(null)} className="w-full">
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
