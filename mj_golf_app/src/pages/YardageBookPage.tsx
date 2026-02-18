import { Link } from 'react-router';
import { BarChart3, BookOpen } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { YardageRow } from '../components/yardage/YardageRow';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { useYardageBook } from '../hooks/useYardageBook';

export function YardageBookPage() {
  const entries = useYardageBook();

  if (entries === undefined) return null;

  return (
    <>
      <TopBar
        title="Yardage Book"
        showSettings
        rightAction={
          entries.length > 0 ? (
            <Link to="/yardage/gapping" className="rounded-lg p-1.5 text-gray-400 hover:text-white">
              <BarChart3 size={20} />
            </Link>
          ) : undefined
        }
      />
      <div className="px-4 py-4">
        {entries.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={40} />}
            title="No yardage data yet"
            description="Log practice sessions to build your yardage book with real data."
            action={
              <Link to="/session/new">
                <Button size="sm">Log a Session</Button>
              </Link>
            }
          />
        ) : (
          <>
            <p className="mb-3 text-xs text-gray-500">
              {entries.length} club{entries.length !== 1 ? 's' : ''} with data — recency-weighted
            </p>
            <div className="flex flex-col gap-2">
              {entries.map((entry) => (
                <YardageRow key={entry.clubId} entry={entry} />
              ))}
            </div>
            <Link to="/yardage/gapping" className="mt-4 block">
              <Button variant="secondary" className="w-full">
                <BarChart3 size={16} /> View Gapping Chart
              </Button>
            </Link>
          </>
        )}
      </div>
    </>
  );
}
