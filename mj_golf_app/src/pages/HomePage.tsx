import { Link } from 'react-router';
import { MapPin, Plus, Briefcase, Shield } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';

export function HomePage() {
  return (
    <>
      <TopBar title="MJ Golf" />
      <div className="px-4 py-6">
        <div className="mb-6">
          <h2 className="mb-1 text-2xl font-bold">Madhu's Yardage Book</h2>
          <p className="text-sm text-text-medium">Powered by real data and statistics.</p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-2">
          <Link
            to="/play"
            className="flex flex-col items-center gap-1.5 rounded-xl bg-primary p-3 text-center text-sm font-medium text-white transition-colors hover:bg-primary-light"
          >
            <MapPin size={20} />
            <span>Play</span>
          </Link>
          <Link
            to="/practice"
            className="flex flex-col items-center gap-1.5 rounded-xl bg-primary p-3 text-center text-sm font-medium text-white transition-colors hover:bg-primary-light"
          >
            <Plus size={20} />
            <span>Practice</span>
          </Link>
        </div>

        {/* Tools */}
        <div className="flex items-center gap-3">
          <Link
            to="/bag"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-text-medium transition-all duration-200 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-px"
          >
            <Briefcase size={14} />
            Bag
          </Link>
          <Link
            to="/admin"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-text-medium transition-all duration-200 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-px"
          >
            <Shield size={14} />
            Admin
          </Link>
        </div>
      </div>
    </>
  );
}
