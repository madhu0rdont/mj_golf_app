import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router';
import { ArrowLeft, Settings, Menu, X, Home, Briefcase, MapPin, HelpCircle, Plus, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const PRIMARY_LINKS = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/practice', icon: Plus, label: 'Practice' },
  { to: '/play', icon: MapPin, label: 'Play' },
  { to: '/bag', icon: Briefcase, label: 'Bag' },
];

const UTILITY_LINKS = [
  { to: '/faq', icon: HelpCircle, label: 'How It Works' },
];

interface TopBarProps {
  title: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
}

export function TopBar({ title, showBack, rightAction }: TopBarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  // Close avatar dropdown on outside click
  useEffect(() => {
    if (!avatarOpen) return;
    const handler = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [avatarOpen]);

  const initials = (user?.displayName || user?.username || '?').slice(0, 2).toUpperCase();

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center border-b border-border bg-card/95 px-4 backdrop-blur-sm">
        <div className="flex w-10 justify-start">
          {showBack ? (
            <button
              onClick={() => navigate(-1)}
              className="rounded-lg p-1.5 text-text-muted hover:text-text-dark"
              aria-label="Go back"
            >
              <ArrowLeft size={20} />
            </button>
          ) : user?.role !== 'admin' ? (
            <button
              onClick={() => setMenuOpen(true)}
              className="rounded-lg p-1.5 text-text-muted hover:text-text-dark"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
          ) : null}
        </div>
        <h1 className="flex-1 text-center text-lg font-semibold text-text-dark">{title}</h1>
        <div className="flex items-center gap-1 justify-end">
          {rightAction}
          <div className="relative" ref={avatarRef}>
            <button
              onClick={() => setAvatarOpen(!avatarOpen)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white overflow-hidden"
              aria-label="User menu"
            >
              {user?.profilePicture ? (
                <img src={user.profilePicture} alt="" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </button>
            {avatarOpen && (
              <div className="absolute right-0 top-10 w-44 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                  {user?.profilePicture ? (
                    <img src={user.profilePicture} alt="" className="h-9 w-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-white flex-shrink-0">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-dark truncate">{user?.displayName || user?.username}</p>
                    <p className="text-xs text-text-muted">{user?.role}</p>
                  </div>
                </div>
                {user?.role !== 'admin' && (
                  <Link
                    to="/settings"
                    onClick={() => setAvatarOpen(false)}
                    className="flex w-full items-center gap-2 px-4 py-3 text-sm text-text-medium hover:bg-surface transition-colors"
                  >
                    <Settings size={16} />
                    Settings
                  </Link>
                )}
                <button
                  onClick={() => { setAvatarOpen(false); logout(); }}
                  className="flex w-full items-center gap-2 px-4 py-3 text-sm text-coral hover:bg-surface transition-colors"
                >
                  <LogOut size={16} />
                  Log Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Menu drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMenuOpen(false)}
          />
          <nav className="relative z-10 flex w-64 flex-col bg-card shadow-lg">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="text-lg font-semibold text-text-dark">MJ Golf</span>
              <button
                onClick={() => setMenuOpen(false)}
                className="rounded-lg p-1.5 text-text-muted hover:text-text-dark"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col py-2">
              {PRIMARY_LINKS.map(({ to, icon: Icon, label }) => {
                const isActive = to === '/' ? pathname === '/' : pathname.startsWith(to);
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                      isActive
                        ? 'bg-primary-pale text-primary font-semibold'
                        : 'text-text-medium hover:bg-surface'
                    }`}
                  >
                    <Icon size={18} />
                    {label}
                  </Link>
                );
              })}
              <div className="h-px bg-border mx-4 my-1" />
              {UTILITY_LINKS.map(({ to, icon: Icon, label }) => {
                const isActive = pathname.startsWith(to);
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                      isActive
                        ? 'bg-primary-pale text-primary font-semibold'
                        : 'text-text-medium hover:bg-surface'
                    }`}
                  >
                    <Icon size={18} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
