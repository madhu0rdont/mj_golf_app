import { Link } from 'react-router';
import { Plus, Briefcase } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { ClubList } from '../components/clubs/ClubList';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { useAllClubs } from '../hooks/useClubs';
import { api } from '../lib/api';

export function ClubBagPage() {
  const clubs = useAllClubs();

  if (clubs === undefined) return null; // loading

  return (
    <>
      <TopBar
        title="My Bag"
        rightAction={
          <Link to="/bag/new" className="rounded-lg p-1.5 text-primary hover:text-primary-light">
            <Plus size={20} />
          </Link>
        }
      />
      <div className="px-4 py-4">
        {clubs.length === 0 ? (
          <EmptyState
            icon={<Briefcase size={40} />}
            title="No clubs in your bag"
            description="Add clubs to get started, or load the default 14-club bag."
            action={
              <div className="flex gap-2">
                <Button onClick={async () => { await api.post('/seed', {}); window.location.reload(); }} size="sm">
                  Load Default Bag
                </Button>
                <Link to="/bag/new">
                  <Button variant="secondary" size="sm">
                    Add Club
                  </Button>
                </Link>
              </div>
            }
          />
        ) : (
          <>
            <p className="mb-3 text-xs text-text-muted">
              {clubs.length} club{clubs.length !== 1 ? 's' : ''} — drag to reorder
            </p>
            <ClubList clubs={clubs} />
            <Link to="/bag/new" className="mt-4 block">
              <Button variant="secondary" className="w-full">
                <Plus size={16} /> Add Club
              </Button>
            </Link>
          </>
        )}
      </div>
    </>
  );
}
