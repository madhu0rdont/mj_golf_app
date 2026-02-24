import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(password);
    if (!result.success) {
      setError(result.error || 'Wrong password');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-primary">MJ Golf</h1>
          <p className="mt-1 text-sm text-text-muted">Club Distances & Yardage Book</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl bg-card p-6 shadow-sm">
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
            placeholder="Enter password"
            autoFocus
          />

          {error && (
            <p className="mb-3 text-sm text-coral">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-light disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
