import { Link, useLocation } from 'react-router';
import { useAuth } from '../../context/AuthContext';

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { to: '/', icon: '⛳', label: 'Dashboard' },
      { to: '/sessions', icon: '📋', label: 'Rounds' },
    ],
  },
  {
    label: 'Practice',
    items: [
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

const BOTTOM_LINKS = [
  { to: '/settings', icon: '⚙️', label: 'Settings' },
  { to: '/faq', icon: '❓', label: 'Help & Feedback' },
];

export function SideNav() {
  const { pathname } = useLocation();
  const { user } = useAuth();

  const isActive = (to: string) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to);

  const initials = (user?.displayName || user?.username || '?').slice(0, 2).toUpperCase();

  return (
    <nav className="hidden md:flex w-[232px] flex-shrink-0 flex-col bg-forest border-r border-white/[0.06]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 pt-7 pb-5.5 border-b border-white/[0.07]">
        <svg width="28" height="38" viewBox="0 0 28 38" fill="none">
          <line x1="8" y1="3" x2="8" y2="37" stroke="#D4A030" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M8 3 L26 9.5 L20 16 L8 16 Z" fill="#B83228" />
          <line x1="5.5" y1="21" x2="8" y2="21" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          <line x1="5.5" y1="26" x2="8" y2="26" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          <line x1="5.5" y1="31" x2="8" y2="31" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          <circle cx="8" cy="37" r="1.5" fill="#D4A030" opacity="0.5" />
        </svg>
        <span className="font-display text-[21px] font-light tracking-[0.06em] text-linen leading-none">
          Flagst<em className="italic text-gold-light">IQ</em>
        </span>
      </div>

      {/* User */}
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-white/[0.07]">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-turf text-xs font-medium text-linen tracking-[0.05em] flex-shrink-0 overflow-hidden">
          {user?.profilePicture ? (
            <img src={user.profilePicture} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div>
          <div className="text-[13px] font-normal text-[#E8E2D6] leading-tight">
            {user?.displayName || user?.username || 'Golfer'}
          </div>
          <div className="font-mono text-[10px] tracking-[0.1em] text-gold-light opacity-80">
            HCP
          </div>
        </div>
      </div>

      {/* Nav sections */}
      <div className="flex-1 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-white/25 px-6 pt-5 pb-2">
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2.5 px-6 py-[9px] border-l-2 transition-all duration-150 no-underline ${
                    active
                      ? 'bg-gold-light/12 border-l-gold-light'
                      : 'border-l-transparent hover:bg-white/5'
                  }`}
                >
                  <span className={`w-4 text-center text-sm ${active ? 'opacity-100' : 'opacity-70'}`}>
                    {item.icon}
                  </span>
                  <span
                    className={`text-[13px] tracking-[0.02em] ${
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

      {/* Bottom links */}
      <div className="mt-auto px-6 py-3.5 border-t border-white/[0.07] flex flex-col gap-0.5">
        {BOTTOM_LINKS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-[9px] py-[7px] opacity-40 hover:opacity-70 transition-opacity no-underline"
          >
            <span className="text-[13px]">{item.icon}</span>
            <span className="text-[12px] font-light text-linen tracking-[0.02em]">
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
