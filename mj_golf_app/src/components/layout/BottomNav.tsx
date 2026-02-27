import { NavLink } from 'react-router';
import { Home, Briefcase, BookOpen, MapPin } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/bag', icon: Briefcase, label: 'Bag' },
  { to: '/yardage', icon: BookOpen, label: 'Yardage' },
  { to: '/strategy', icon: MapPin, label: 'Strategy' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors ${
                isActive ? 'text-primary font-semibold' : 'text-text-muted hover:text-text-medium'
              }`
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
