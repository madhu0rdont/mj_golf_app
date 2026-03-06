import { Link } from 'react-router';
import { MapPin, BookOpen } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';

export function PlayPage() {
  return (
    <>
      <TopBar title="Play" showBack />
      <div className="px-4 py-6">
        <div className="mb-6">
          <h3 className="mb-2 font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand">Play</h3>
          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/strategy"
              className="shimmer-hover flex flex-col items-center gap-1.5 rounded-sm bg-forest p-3 text-center text-sm font-medium text-white transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)]"
            >
              <MapPin size={20} />
              <span>Course Mgmt</span>
            </Link>
            <Link
              to="/yardage"
              className="shimmer-hover flex flex-col items-center gap-1.5 rounded-sm bg-parchment border border-sand p-3 text-center text-sm font-medium text-forest transition-all duration-200 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-1"
            >
              <BookOpen size={20} />
              <span>Yardage Book</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
