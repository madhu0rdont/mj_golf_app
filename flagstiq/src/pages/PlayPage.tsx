import { Link } from 'react-router';
import { MapPin, BookOpen } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { PageHeader } from '../components/layout/PageHeader';

export function PlayPage() {
  return (
    <>
      <TopBar title="Play" showBack />
      <PageHeader eyebrow="On Course" title="Play" titleEmphasis="Mode" />

      <div className="relative z-[1]">
        {/* Divider */}
        <div className="animate-fadeIn delay-2 mx-8 mt-6 divider-gradient hidden md:block" />

        {/* Section label */}
        <p className="animate-fadeIn delay-2 px-4 md:px-8 pt-5 pb-3 font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand">
          Choose mode
        </p>

        {/* Action cards */}
        <div className="animate-fadeUp delay-3 px-4 md:px-8 pb-8 grid grid-cols-1 md:grid-cols-2 gap-[2px]">
          {/* Course Management */}
          <Link
            to="/strategy"
            className="relative shimmer-hover rounded-sm bg-forest text-white p-5 pt-7 pb-5 flex flex-col gap-3 transition-all duration-250 hover:brightness-[1.06] no-underline overflow-hidden"
          >
            <div className="absolute bottom-[-10px] right-2 font-display text-[5.5rem] font-light leading-none opacity-[0.06] pointer-events-none select-none">01</div>
            <div className="w-10 h-10 rounded-sm bg-white/10 flex items-center justify-center">
              <MapPin size={20} />
            </div>
            <div className="relative z-[1]">
              <div className="font-display text-[1.35rem] font-light leading-tight mb-1">Course Strategy</div>
              <div className="text-[0.72rem] font-light opacity-70 leading-snug">
                Game plans, strategy optimizer & scoring projections
              </div>
            </div>
            <div className="mt-auto font-mono text-[11px] tracking-[0.1em] text-white/30">→ Open strategy</div>
          </Link>

          {/* Yardage Book */}
          <Link
            to="/yardage"
            className="relative shimmer-hover rounded-sm bg-turf text-white p-5 pt-7 pb-5 flex flex-col gap-3 transition-all duration-250 hover:brightness-[1.06] no-underline overflow-hidden"
          >
            <div className="absolute bottom-[-10px] right-2 font-display text-[5.5rem] font-light leading-none opacity-[0.06] pointer-events-none select-none">02</div>
            <div className="w-10 h-10 rounded-sm bg-white/10 flex items-center justify-center">
              <BookOpen size={20} />
            </div>
            <div className="relative z-[1]">
              <div className="font-display text-[1.35rem] font-light leading-tight mb-1">Yardage Book</div>
              <div className="text-[0.72rem] font-light opacity-70 leading-snug">
                GPS yardages, hole maps & club recommendations
              </div>
            </div>
            <div className="mt-auto font-mono text-[11px] tracking-[0.1em] text-white/30">→ Open book</div>
          </Link>
        </div>
      </div>
    </>
  );
}
