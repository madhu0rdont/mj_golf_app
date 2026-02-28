import { Link } from 'react-router';
import { Plus, BookOpen, MapPin } from 'lucide-react';
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

        {/* Play Section */}
        <div className="mb-6">
          <h3 className="mb-2 text-[10px] font-medium text-text-muted uppercase tracking-wide">Play</h3>
          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/strategy"
              className="flex flex-col items-center gap-1.5 rounded-xl bg-primary p-3 text-center text-sm font-medium text-white transition-colors hover:bg-primary-light"
            >
              <MapPin size={20} />
              <span>Course Mgmt</span>
            </Link>
            <Link
              to="/yardage"
              className="flex flex-col items-center gap-1.5 rounded-xl bg-card border border-border shadow-sm p-3 text-center text-sm font-medium transition-all duration-200 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-px"
            >
              <BookOpen size={20} />
              <span>Yardage Book</span>
            </Link>
          </div>
        </div>

        {/* Practice Section */}
        <div className="mb-6">
          <h3 className="mb-2 text-[10px] font-medium text-text-muted uppercase tracking-wide">Practice</h3>
          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/practice"
              className="flex flex-col items-center gap-1.5 rounded-xl bg-primary p-3 text-center text-sm font-medium text-white transition-colors hover:bg-primary-light"
            >
              <Plus size={20} />
              <span>Practice</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
