import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router';
import { MapPin, Plus, Briefcase, Info } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { useAuth } from '../context/AuthContext';
import { useHandicap } from '../hooks/useHandicap';
import { useRecentSessions } from '../hooks/useSessions';
import { useAllClubs } from '../hooks/useClubs';
import { useCourses } from '../hooks/useCourses';

function CoursesTrackedRow({ courseCount, courseNames }: { courseCount: number; courseNames: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative flex items-center gap-2" ref={ref}>
      <div className="h-1.5 w-1.5 rounded-full bg-fairway flex-shrink-0" />
      <span className="font-mono text-[0.7rem] text-forest tracking-wide">
        <strong className="text-turf">{courseCount}</strong> course{courseCount !== 1 ? 's' : ''} tracked
      </span>
      {courseNames.length > 0 && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-center text-sage hover:text-turf transition-colors -ml-0.5"
          aria-label="Show courses used in handicap"
        >
          <Info size={13} />
        </button>
      )}
      {open && courseNames.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-20 rounded-lg border border-sand bg-white shadow-md px-3 py-2 min-w-[160px]">
          <p className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-sand mb-1.5">Courses in calc</p>
          <ul className="flex flex-col gap-1">
            {courseNames.map((name) => (
              <li key={name} className="font-mono text-[0.7rem] text-forest">{name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const { handicap, courseCount, courseNames } = useHandicap();
  const recentSessions = useRecentSessions(3);
  const clubs = useAllClubs();
  const { courses } = useCourses();

  const firstName = user?.displayName?.split(' ')[0] || user?.username || 'My';

  // Build club name map for sessions
  const clubMap = new Map(clubs?.map((c) => [c.id, c.name]) ?? []);

  // Find home course from user preference
  const homeCourse = courses?.find(c => c.id === user?.homeCourseId) || null;

  return (
    <>
      <TopBar title="FlagstIQ" />
      <div className="relative z-[1]">
        {/* Hero */}
        <section className="px-8 pt-8 pb-0">
          <h1 className="animate-fadeUp delay-2 font-display text-[clamp(2.8rem,6vw,5rem)] font-black leading-[0.95] text-forest mb-1.5">
            {firstName}'s<br /><em className="italic text-fairway">Game</em>
          </h1>
          <p className="animate-fadeUp delay-3 text-[0.9rem] text-sage font-light tracking-wide">
            Powered by real data and statistics.
          </p>

          {/* Handicap strip */}
          {handicap !== null && (
            <div className="animate-fadeUp delay-4 mt-7 flex items-stretch">
              <div className="bg-forest text-white px-7 py-4.5 rounded-l-2xl flex flex-col gap-0.5">
                <div className="font-display text-5xl font-black leading-none text-gold">
                  {handicap}
                </div>
                <div className="font-mono text-[0.6rem] tracking-[0.15em] uppercase text-sage">
                  Est. Handicap
                </div>
              </div>
              <div className="bg-parchment border border-sand px-6 py-4.5 rounded-r-2xl flex flex-col justify-center gap-2 flex-1">
                <CoursesTrackedRow courseCount={courseCount} courseNames={courseNames} />
                {homeCourse && (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-gold flex-shrink-0" />
                    <span className="font-mono text-[0.7rem] text-forest tracking-wide">
                      {homeCourse.name} — home course
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-sand flex-shrink-0" />
                  <span className="font-mono text-[0.7rem] text-forest tracking-wide">
                    <strong className="text-turf">{clubs?.length ?? 0}</strong> clubs in bag
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Divider */}
        <div className="animate-fadeIn delay-5 mx-8 mt-8 divider-gradient" />

        {/* Section label */}
        <p className="animate-fadeIn delay-5 px-8 pt-5 pb-3 font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand">
          Quick actions
        </p>

        {/* Action cards */}
        <div className="animate-fadeUp delay-6 px-8 pb-8 grid grid-cols-3 gap-3">
          {/* Play */}
          <Link
            to="/play"
            className="shimmer-hover rounded-[20px] bg-forest text-white p-5 pt-7 pb-5 flex flex-col gap-3 transition-all duration-250 hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)] no-underline"
          >
            <div className="absolute bottom-[-10px] right-2 font-display text-[5.5rem] font-black leading-none opacity-[0.06] pointer-events-none select-none">01</div>
            <div className="w-10 h-10 rounded-[12px] bg-white/10 flex items-center justify-center">
              <MapPin size={20} />
            </div>
            <div className="relative z-[1]">
              <div className="font-display text-[1.35rem] font-bold leading-tight mb-1">Play</div>
              <div className="text-[0.72rem] font-light opacity-70 leading-snug">
                Start a round with GPS yardages & strategy
              </div>
            </div>
            <div className="mt-auto text-lg opacity-50 transition-all group-hover:opacity-100 group-hover:translate-x-1">→</div>
          </Link>

          {/* Practice */}
          <Link
            to="/practice"
            className="shimmer-hover rounded-[20px] bg-turf text-white p-5 pt-7 pb-5 flex flex-col gap-3 transition-all duration-250 hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)] no-underline"
          >
            <div className="absolute bottom-[-10px] right-2 font-display text-[5.5rem] font-black leading-none opacity-[0.06] pointer-events-none select-none">02</div>
            <div className="w-10 h-10 rounded-[12px] bg-white/10 flex items-center justify-center">
              <Plus size={20} />
            </div>
            <div className="relative z-[1]">
              <div className="font-display text-[1.35rem] font-bold leading-tight mb-1">Practice</div>
              <div className="text-[0.72rem] font-light opacity-70 leading-snug">
                Log GC4 data, putting & drill sessions
              </div>
            </div>
            <div className="mt-auto text-lg opacity-50">→</div>
          </Link>

          {/* Bag */}
          <Link
            to="/bag"
            className="shimmer-hover rounded-[20px] bg-parchment border-[1.5px] border-sand text-forest p-5 pt-7 pb-5 flex flex-col gap-3 transition-all duration-250 hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)] no-underline"
          >
            <div className="absolute bottom-[-10px] right-2 font-display text-[5.5rem] font-black leading-none opacity-[0.06] pointer-events-none select-none text-forest">03</div>
            <div className="w-10 h-10 rounded-[12px] bg-turf/10 flex items-center justify-center">
              <Briefcase size={20} className="text-turf" />
            </div>
            <div className="relative z-[1]">
              <div className="font-display text-[1.35rem] font-bold leading-tight mb-1">Bag</div>
              <div className="text-[0.72rem] font-light opacity-70 leading-snug">
                Clubs, distances & equipment setup
              </div>
            </div>
            <div className="mt-auto text-lg opacity-50 text-forest">→</div>
          </Link>
        </div>

        {/* Recent Sessions */}
        {recentSessions && recentSessions.length > 0 && (
          <div className="animate-fadeUp delay-6 mx-8 mb-8">
            <div className="flex items-center justify-between mb-3.5">
              <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand">
                Recent sessions
              </span>
              <Link to="/sessions" className="text-[0.72rem] text-fairway font-medium no-underline">
                View all →
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {recentSessions.map((session) => (
                <Link
                  key={session.id}
                  to={`/session/${session.id}`}
                  className="flex items-center justify-between bg-white border border-parchment rounded-[12px] px-4.5 py-3.5 transition-colors hover:border-sage no-underline"
                >
                  <div>
                    <div className="text-[0.85rem] font-medium text-forest">
                      {session.type === 'wedge-distance'
                        ? 'Wedge Practice'
                        : session.type === 'interleaved'
                          ? 'Interleaved Practice'
                          : clubMap.get(session.clubId ?? '') || 'Unknown Club'}
                    </div>
                    <div className="font-mono text-[0.65rem] text-sand mt-0.5">
                      {new Date(session.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                      {session.location && ` · ${session.location}`}
                      {' · '}
                      {session.shotCount} shots
                    </div>
                  </div>
                  <span className="text-sand text-[0.9rem]">›</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
