import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';

type View = 'login' | 'register' | 'forgot' | 'forgot-sent' | 'register-done' | 'setup';

const inputClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-dark outline-none focus:border-fairway focus:ring-1 focus:ring-fairway';

export function LoginPage() {
  const { login, needsSetup, setup, forgotPassword, register } = useAuth();
  const [view, setView] = useState<View>(needsSetup ? 'setup' : 'login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Login state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  // Register state
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState('');

  // Setup form state
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [playerUsername, setPlayerUsername] = useState('');
  const [playerPassword, setPlayerPassword] = useState('');
  const [playerDisplayName, setPlayerDisplayName] = useState('');

  const switchView = (v: View) => {
    setError('');
    setView(v);
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(identifier, password);
    if (!result.success) {
      setError(result.error || 'Login failed');
      setLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (regPassword !== regConfirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    const result = await register({
      username: regUsername,
      email: regEmail,
      password: regPassword,
      displayName: regDisplayName || undefined,
    });

    setLoading(false);
    if (result.success) {
      switchView('register-done');
    } else {
      setError(result.error || 'Registration failed');
    }
  };

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await forgotPassword(forgotEmail);
    setLoading(false);
    if (result.success) {
      switchView('forgot-sent');
    } else {
      setError(result.error || 'Request failed');
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

  // Setup view (first-time only)
  if (view === 'setup') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="font-display text-3xl font-bold text-forest">MJ <span className="text-fairway">Golf</span></h1>
            <p className="mt-1 font-mono text-xs tracking-wider text-sand uppercase">First-time setup</p>
          </div>

          <form onSubmit={handleSetup} className="rounded-[20px] bg-card p-6 shadow-[var(--shadow-card)] space-y-4">
            <p className="text-xs text-text-muted">Create an admin account (for managing courses and users) and your player account.</p>

            <div>
              <label className="mb-1 block text-xs font-medium text-text-medium">Admin Username</label>
              <input type="text" autoComplete="off" value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} className={inputClass} placeholder="admin" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-medium">Admin Password</label>
              <input type="password" autoComplete="new-password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className={inputClass} />
            </div>

            <hr className="border-border" />

            <div>
              <label className="mb-1 block text-xs font-medium text-text-medium">Your Username</label>
              <input type="text" autoComplete="off" value={playerUsername} onChange={(e) => setPlayerUsername(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-medium">Your Password</label>
              <input type="password" autoComplete="new-password" value={playerPassword} onChange={(e) => setPlayerPassword(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-medium">Display Name (optional)</label>
              <input type="text" autoComplete="off" value={playerDisplayName} onChange={(e) => setPlayerDisplayName(e.target.value)} className={inputClass} placeholder="MJ" />
            </div>

            {error && <p className="text-sm text-coral">{error}</p>}

            <Button type="submit" disabled={loading || !adminUsername || !adminPassword || !playerUsername || !playerPassword} className="w-full">
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
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold text-forest">MJ <span className="text-fairway">Golf</span></h1>
        </div>

        <div className="rounded-[20px] bg-card p-6 shadow-[var(--shadow-card)]">

          {/* ── Login View ── */}
          {view === 'login' && (
            <form onSubmit={handleLogin}>
              <p className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand mb-1">Welcome back</p>
              <h2 className="font-display text-2xl font-bold text-forest mb-6">
                Sign <em className="not-italic text-fairway italic">in</em>
              </h2>

              <label htmlFor="identifier" className="mb-1.5 block text-xs font-medium text-text-medium">
                Email or username
              </label>
              <input
                id="identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className={`${inputClass} mb-4`}
                placeholder="you@example.com"
                autoFocus
              />

              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="text-xs font-medium text-text-medium">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => switchView('forgot')}
                  className="text-[11px] text-sand hover:text-text-medium transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} mb-5`}
                placeholder="Password"
              />

              {error && <p className="mb-3 text-sm text-coral">{error}</p>}

              <Button type="submit" disabled={loading || !identifier || !password} className="w-full">
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>

              <div className="my-5 flex items-center gap-3">
                <div className="flex-1 divider-gradient" />
                <span className="font-mono text-[10px] tracking-wider uppercase text-sand">or</span>
                <div className="flex-1 divider-gradient" style={{ transform: 'scaleX(-1)' }} />
              </div>

              <p className="text-center text-sm text-text-medium">
                New to FlagstIQ?{' '}
                <button type="button" onClick={() => switchView('register')} className="font-semibold text-turf hover:text-fairway transition-colors">
                  Create account
                </button>
              </p>
            </form>
          )}

          {/* ── Register View ── */}
          {view === 'register' && (
            <form onSubmit={handleRegister}>
              <p className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand mb-1">Join the club</p>
              <h2 className="font-display text-2xl font-bold text-forest mb-6">
                Create <em className="not-italic text-fairway italic">account</em>
              </h2>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-medium">Display Name</label>
                  <input type="text" autoComplete="name" value={regDisplayName} onChange={(e) => setRegDisplayName(e.target.value)} className={inputClass} placeholder="Optional" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-medium">Username</label>
                  <input type="text" autoComplete="username" value={regUsername} onChange={(e) => setRegUsername(e.target.value)} className={inputClass} placeholder="Choose a username" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-medium">Email</label>
                  <input type="email" autoComplete="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} className={inputClass} placeholder="you@example.com" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-medium">Password</label>
                  <input type="password" autoComplete="new-password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} className={inputClass} placeholder="At least 8 characters" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-medium">Confirm Password</label>
                  <input type="password" autoComplete="new-password" value={regConfirm} onChange={(e) => setRegConfirm(e.target.value)} className={inputClass} placeholder="Confirm password" />
                </div>
              </div>

              {error && <p className="mt-3 text-sm text-coral">{error}</p>}

              <Button
                type="submit"
                disabled={loading || !regUsername || !regEmail || !regPassword || !regConfirm}
                className="w-full mt-5"
              >
                {loading ? 'Creating account...' : 'Create account'}
              </Button>

              <p className="mt-4 text-center text-sm text-text-medium">
                Already have an account?{' '}
                <button type="button" onClick={() => switchView('login')} className="font-semibold text-turf hover:text-fairway transition-colors">
                  Sign in
                </button>
              </p>
            </form>
          )}

          {/* ── Forgot Password View ── */}
          {view === 'forgot' && (
            <form onSubmit={handleForgot}>
              <p className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand mb-1">Reset password</p>
              <h2 className="font-display text-2xl font-bold text-forest mb-2">
                Forgot <em className="not-italic text-fairway italic">password</em>?
              </h2>
              <p className="text-xs text-text-muted mb-6">Enter your email and we'll send you a link to reset your password.</p>

              <label className="mb-1.5 block text-xs font-medium text-text-medium">Email</label>
              <input
                type="email"
                autoComplete="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className={`${inputClass} mb-5`}
                placeholder="you@example.com"
                autoFocus
              />

              {error && <p className="mb-3 text-sm text-coral">{error}</p>}

              <Button type="submit" disabled={loading || !forgotEmail} className="w-full">
                {loading ? 'Sending...' : 'Send reset link'}
              </Button>

              <p className="mt-4 text-center text-sm text-text-medium">
                Back to{' '}
                <button type="button" onClick={() => switchView('login')} className="font-semibold text-turf hover:text-fairway transition-colors">
                  Sign in
                </button>
              </p>
            </form>
          )}

          {/* ── Forgot Password Sent View ── */}
          {view === 'forgot-sent' && (
            <div className="text-center">
              <p className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand mb-1">Check your email</p>
              <h2 className="font-display text-2xl font-bold text-forest mb-4">
                Link <em className="not-italic text-fairway italic">sent</em>
              </h2>
              <p className="text-sm text-text-medium mb-6">
                If an account exists with that email, we've sent a password reset link. Check your inbox.
              </p>

              <button
                type="button"
                onClick={() => switchView('login')}
                className="text-sm font-semibold text-turf hover:text-fairway transition-colors"
              >
                Back to Sign in
              </button>
            </div>
          )}

          {/* ── Registration Done View ── */}
          {view === 'register-done' && (
            <div className="text-center">
              <p className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand mb-1">Almost there</p>
              <h2 className="font-display text-2xl font-bold text-forest mb-4">
                Account <em className="not-italic text-fairway italic">created</em>
              </h2>
              <p className="text-sm text-text-medium mb-6">
                Your account is pending admin approval. You'll receive an email when it's activated.
              </p>

              <button
                type="button"
                onClick={() => switchView('login')}
                className="text-sm font-semibold text-turf hover:text-fairway transition-colors"
              >
                Back to Sign in
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
