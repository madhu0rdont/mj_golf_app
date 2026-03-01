import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router';
import { ArrowLeft, Settings, Menu, X, Home, Briefcase, MapPin, HelpCircle, Plus } from 'lucide-react';

const PRIMARY_LINKS = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/practice', icon: Plus, label: 'Practice' },
  { to: '/play', icon: MapPin, label: 'Play' },
  { to: '/bag', icon: Briefcase, label: 'Bag' },
];

const UTILITY_LINKS = [
  { to: '/faq', icon: HelpCircle, label: 'How It Works' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

interface TopBarProps {
  title: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
}

export function TopBar({ title, showBack, rightAction }: TopBarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center border-b border-border bg-card/95 px-4 backdrop-blur-sm">
        <div className="flex w-10 justify-start">
          {showBack ? (
            <button
              onClick={() => navigate(-1)}
              className="rounded-lg p-1.5 text-text-muted hover:text-text-dark"
            >
              <ArrowLeft size={20} />
            </button>
          ) : (
            <button
              onClick={() => setMenuOpen(true)}
              className="rounded-lg p-1.5 text-text-muted hover:text-text-dark"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
          )}
        </div>
        <h1 className="flex-1 text-center text-lg font-semibold text-text-dark">{title}</h1>
        <div className="flex w-10 justify-end">
          {rightAction}
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
