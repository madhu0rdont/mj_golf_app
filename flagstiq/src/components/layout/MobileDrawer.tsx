import { Link, useLocation } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useHandicap } from '../../hooks/useHandicap';
import { LogOut } from 'lucide-react';

const PLAYER_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { to: '/', icon: '⛳', label: 'Dashboard' },
    ],
  },
  {
    label: 'Practice',
    items: [
      { to: '/sessions', icon: '📋', label: 'Rounds' },
      { to: '/yardage', icon: '📐', label: 'Yardage Book' },
      { to: '/practice', icon: '🎯', label: 'Drills' },
    ],
  },
  {
    label: 'Course',
    items: [
      { to: '/strategy', icon: '🗺', label: 'Strategy' },
      { to: '/bag', icon: '🏌️', label: 'Bag Setup' },
    ],
  },
];

const ADMIN_SECTIONS = [
  {
    label: 'Admin',
    items: [
      { to: '/admin', icon: '🛡', label: 'Dashboard' },
      { to: '/admin/courses', icon: '🗺', label: 'Courses' },
      { to: '/admin/penalties', icon: '🛡', label: 'Penalties' },
      { to: '/admin/constants', icon: '🎛', label: 'Strategy Constants' },
      { to: '/admin/import', icon: '📥', label: 'Import Course' },
      { to: '/admin/users', icon: '👥', label: 'Users' },
      { to: '/admin/usage', icon: '📊', label: 'Usage & Spend' },
    ],
  },
];

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const { handicap } = useHandicap();

  const isAdmin = user?.role === 'admin';
  const navSections = isAdmin ? ADMIN_SECTIONS : PLAYER_SECTIONS;

  const isActive = (to: string) =>
    to === '/admin' ? pathname === '/admin' : to === '/' ? pathname === '/' : pathname.startsWith(to);

  const initials = (user?.displayName || user?.username || '?').slice(0, 2).toUpperCase();

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-[200] bg-black/50 transition-opacity duration-250 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 left-0 bottom-0 z-[300] w-[280px] bg-forest flex flex-col pt-[50px] transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-5 border-b border-white/[0.07]">
          <svg width="22" height="30" viewBox="0 0 28 38" fill="none">
            <line x1="8" y1="3" x2="8" y2="37" stroke="#D4A030" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M8 3 L26 9.5 L20 16 L8 16 Z" fill="#B83228" />
            <line x1="5.5" y1="21" x2="8" y2="21" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
            <line x1="5.5" y1="26" x2="8" y2="26" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
            <line x1="5.5" y1="31" x2="8" y2="31" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          </svg>
          <span className="font-display text-[22px] font-light tracking-[0.06em] text-linen leading-none">
            Flagst<em className="italic text-gold-light">IQ</em>
          </span>
        </div>

        {/* User */}
        <div className="flex items-center gap-2.5 px-6 py-4 border-b border-white/[0.07]">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-turf text-xs font-medium text-linen tracking-[0.05em] flex-shrink-0 overflow-hidden">
            {user?.profilePicture ? (
              <img src={user.profilePicture} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div>
            <div className="text-sm font-normal text-[#E8E2D6]">
              {user?.displayName || user?.username || 'Golfer'}
            </div>
            {handicap != null && (
              <div className="font-mono text-[10px] tracking-[0.1em] text-gold-light opacity-80">
                HCP {handicap.toFixed(1)}
              </div>
            )}
          </div>
        </div>

        {/* Nav sections */}
        <div className="flex-1 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label}>
              <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-white/25 px-6 pt-4 pb-1.5">
                {section.label}
              </div>
              {section.items.map((item) => {
                const active = isActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    className={`flex items-center gap-3 px-6 py-[11px] border-l-2 transition-all duration-150 no-underline ${
                      active
                        ? 'bg-gold-light/10 border-l-gold-light'
                        : 'border-l-transparent active:bg-white/5'
                    }`}
                  >
                    <span className="text-base w-5 text-center">{item.icon}</span>
                    <span
                      className={`text-sm ${
                        active
                          ? 'text-linen font-normal'
                          : 'text-linen/60 font-light'
                      }`}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-auto px-6 py-4 border-t border-white/[0.07]">
          <Link
            to="/settings"
            onClick={onClose}
            className="flex items-center gap-2.5 py-2 opacity-40 hover:opacity-70 transition-opacity no-underline"
          >
            <span className="text-sm">⚙️</span>
            <span className="text-[13px] font-light text-linen">Settings</span>
          </Link>
          <Link
            to="/faq"
            onClick={onClose}
            className="flex items-center gap-2.5 py-2 opacity-40 hover:opacity-70 transition-opacity no-underline"
          >
            <span className="text-sm">❓</span>
            <span className="text-[13px] font-light text-linen">Help & Feedback</span>
          </Link>
          <button
            onClick={() => { onClose(); logout(); }}
            className="flex items-center gap-2.5 py-2 opacity-40 hover:opacity-70 transition-opacity w-full"
          >
            <LogOut size={14} className="text-linen" />
            <span className="text-[13px] font-light text-linen">Log Out</span>
          </button>
        </div>
      </div>
    </>
  );
}
