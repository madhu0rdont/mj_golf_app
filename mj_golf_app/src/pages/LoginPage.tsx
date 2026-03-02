import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';

export function LoginPage() {
  const { login, needsSetup, setup } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Setup form state
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [playerUsername, setPlayerUsername] = useState('');
  const [playerPassword, setPlayerPassword] = useState('');
  const [playerDisplayName, setPlayerDisplayName] = useState('');

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);
    if (!result.success) {
      setError(result.error || 'Login failed');
      setLoading(false);
    }
  };

  const handleSetup = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await setup({
      adminUsername,
      adminPassword,
      playerUsername,
      playerPassword,
      playerDisplayName: playerDisplayName || undefined,
    });
    if (!result.success) {
      setError(result.error || 'Setup failed');
      setLoading(false);
    }
  };

  if (needsSetup) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-primary">MJ Golf</h1>
            <p className="mt-1 text-sm text-text-muted">First-time setup</p>
          </div>

          <form onSubmit={handleSetup} className="rounded-xl bg-card p-6 shadow-sm space-y-4">
            <p className="text-xs text-text-muted">Create an admin account (for managing courses and users) and your player account.</p>

            <div>
              <label className="mb-1 block text-xs font-medium text-text-medium">Admin Username</label>
              <input
                type="text"
                autoComplete="off"
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-dark outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="admin"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-medium">Admin Password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-dark outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <hr className="border-border" />

            <div>
              <label className="mb-1 block text-xs font-medium text-text-medium">Your Username</label>
              <input
                type="text"
                autoComplete="off"
                value={playerUsername}
                onChange={(e) => setPlayerUsername(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-dark outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-medium">Your Password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={playerPassword}
                onChange={(e) => setPlayerPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-dark outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-medium">Display Name (optional)</label>
              <input
                type="text"
                autoComplete="off"
                value={playerDisplayName}
                onChange={(e) => setPlayerDisplayName(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-dark outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="MJ"
              />
            </div>

            {error && <p className="text-sm text-coral">{error}</p>}

            <Button
              type="submit"
              disabled={loading || !adminUsername || !adminPassword || !playerUsername || !playerPassword}
              className="w-full"
            >
              {loading ? 'Setting up...' : 'Complete Setup'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-primary">MJ Golf</h1>
          <p className="mt-1 text-sm text-text-muted">Club Distances & Yardage Book</p>
        </div>

        <form onSubmit={handleLogin} className="rounded-xl bg-card p-6 shadow-sm">
          <label htmlFor="username" className="mb-2 block text-sm font-medium text-text-medium">
            Username
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mb-4 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-dark outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            placeholder="Username"
            autoFocus
          />

          <label htmlFor="password" className="mb-2 block text-sm font-medium text-text-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-dark outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            placeholder="Password"
          />

          {error && (
            <p className="mb-3 text-sm text-coral">{error}</p>
          )}

          <Button type="submit" disabled={loading || !username || !password} className="w-full">
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}
