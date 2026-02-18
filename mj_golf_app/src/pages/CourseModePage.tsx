import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { ClubRecommendationCard } from '../components/course/ClubRecommendation';
import { EmptyState } from '../components/ui/EmptyState';
import { useYardageBook } from '../hooks/useYardageBook';
import { getClubRecommendations } from '../hooks/useCourseStrategy';
import { Link } from 'react-router';
import { Button } from '../components/ui/Button';

export function CourseModePage() {
  const entries = useYardageBook();
  const [targetYardage, setTargetYardage] = useState('');

  if (entries === undefined) return null;

  const target = parseFloat(targetYardage);
  const recommendations = !isNaN(target) && target > 0 ? getClubRecommendations(target, entries) : [];

  return (
    <>
      <TopBar title="Course Mode" showSettings />
      <div className="px-4 py-4">
        {entries.length === 0 ? (
          <EmptyState
            icon={<MapPin size={40} />}
            title="No yardage data"
            description="Log practice sessions first to get club recommendations."
            action={
              <Link to="/session/new">
                <Button size="sm">Log a Session</Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-text-medium">
                Target Distance
              </label>
              <div className="relative">
                <input
                  type="number"
                  inputMode="numeric"
                  value={targetYardage}
                  onChange={(e) => setTargetYardage(e.target.value)}
                  placeholder="Enter yardage..."
                  className="w-full rounded-xl border border-border bg-card px-5 py-4 text-center text-3xl font-bold text-text-dark placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-text-muted">
                  yds
                </span>
              </div>
            </div>

            {recommendations.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-medium text-text-medium uppercase">
                  Club Recommendations
                </h3>
                <div className="flex flex-col gap-2">
                  {recommendations.map((rec) => (
                    <ClubRecommendationCard key={rec.clubId} rec={rec} />
                  ))}
                </div>
              </div>
            )}

            {targetYardage && !isNaN(target) && target > 0 && recommendations.length === 0 && (
              <p className="mt-4 text-center text-sm text-text-muted">
                No clubs within 25 yards of {target} yds. Check your yardage book.
              </p>
            )}

            {!targetYardage && (
              <p className="mt-4 text-center text-sm text-text-muted">
                Enter a target distance to get club recommendations based on your yardage book.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
