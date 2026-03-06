import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { MobileDrawer } from './MobileDrawer';

interface TopBarProps {
  title: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
  dark?: boolean;
}

export function TopBar({ title: _title, showBack, rightAction, dark }: TopBarProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const initials = (user?.displayName || user?.username || '?').slice(0, 2).toUpperCase();

  return (
    <>
      {/* Mobile-only header */}
      <header
        className={`md:hidden sticky top-0 z-40 flex h-[52px] items-center justify-between px-5 ${
          dark
            ? 'bg-forest border-b border-white/[0.07]'
            : 'border-b border-card-border'
        }`}
      >
        {/* Left */}
        <div className="w-9">
          {showBack ? (
            <button
              onClick={() => navigate(-1)}
              className={`p-1 ${dark ? 'text-linen/70' : 'text-text-muted hover:text-text-dark'}`}
              aria-label="Go back"
            >
              <ArrowLeft size={20} />
            </button>
          ) : (
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex flex-col justify-center gap-[5px] p-1 cursor-pointer"
              aria-label="Open menu"
            >
              <span className={`block h-[1.5px] w-5 rounded-sm ${dark ? 'bg-linen/70' : 'bg-ink'}`} />
              <span className={`block h-[1.5px] w-3.5 rounded-sm ${dark ? 'bg-linen/70' : 'bg-ink'}`} />
              <span className={`block h-[1.5px] w-5 rounded-sm ${dark ? 'bg-linen/70' : 'bg-ink'}`} />
            </button>
          )}
        </div>

        {/* Center — Logo */}
        <span className={`font-display text-xl font-light tracking-[0.06em] ${dark ? 'text-linen' : 'text-ink'}`}>
          Flagst<em className={`italic ${dark ? 'text-gold-light' : 'text-turf'}`}>IQ</em>
        </span>

        {/* Right */}
        <div className="flex items-center gap-1">
          {rightAction}
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-turf text-[11px] font-medium text-linen tracking-[0.05em] overflow-hidden">
            {user?.profilePicture ? (
              <img src={user.profilePicture} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
