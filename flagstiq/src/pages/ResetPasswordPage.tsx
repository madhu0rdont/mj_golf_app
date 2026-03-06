import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';

export function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  const inputClass =
    'w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-sm text-text-dark outline-none focus:border-fairway focus:ring-1 focus:ring-fairway';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    const result = await resetPassword(token!, password);
    setLoading(false);

    if (result.success) {
      setDone(true);
    } else {
      setError(result.error || 'Reset failed');
    }
  };

  const goToLogin = () => {
    window.location.href = '/';
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-light text-forest">MJ <span className="text-fairway">Golf</span></h1>
        </div>

        <div className="rounded-sm bg-card p-6 shadow-[var(--shadow-card)]">
          {!token ? (
            <div className="text-center">
              <p className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand mb-1">Invalid link</p>
              <h2 className="font-display text-2xl font-light text-forest mb-4">
                Missing <em className="not-italic text-fairway italic">token</em>
              </h2>
              <p className="text-sm text-text-medium mb-6">
                This reset link appears to be invalid. Please request a new one.
              </p>
              <button type="button" onClick={goToLogin} className="text-sm font-semibold text-turf hover:text-fairway transition-colors">
                Back to Sign in
              </button>
            </div>
          ) : done ? (
            <div className="text-center">
              <p className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand mb-1">All set</p>
              <h2 className="font-display text-2xl font-light text-forest mb-4">
                Password <em className="not-italic text-fairway italic">updated</em>
              </h2>
              <p className="text-sm text-text-medium mb-6">
                Your password has been reset. You can now sign in with your new password.
              </p>
              <button type="button" onClick={goToLogin} className="text-sm font-semibold text-turf hover:text-fairway transition-colors">
                Sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand mb-1">Reset password</p>
              <h2 className="font-display text-2xl font-light text-forest mb-6">
                New <em className="not-italic text-fairway italic">password</em>
              </h2>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-medium">New Password</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    placeholder="At least 8 characters"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-medium">Confirm Password</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={inputClass}
                    placeholder="Confirm password"
                  />
                </div>
              </div>

              {error && <p className="mt-3 text-sm text-coral">{error}</p>}

              <Button type="submit" disabled={loading || !password || !confirm} className="w-full mt-5">
                {loading ? 'Updating...' : 'Update password'}
              </Button>

              <p className="mt-4 text-center text-sm text-text-medium">
                <button type="button" onClick={goToLogin} className="font-semibold text-turf hover:text-fairway transition-colors">
                  Back to Sign in
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
