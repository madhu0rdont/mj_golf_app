import type { WeatherConditions, HoleWeatherAdjustment } from '../../services/weather';

interface WeatherBannerProps {
  weather: WeatherConditions;
  adjustment: HoleWeatherAdjustment | null; // per-hole (hole view) or null
  courseTotalAdjust: number;                // total course adjustment (game plan view)
  viewMode: 'hole' | 'gameplan';
}

function windLabel(headwindMph: number): string {
  const abs = Math.abs(headwindMph);
  if (abs < 1) return 'calm';
  const dir = headwindMph > 0 ? 'headwind' : 'helping';
  return `${Math.round(abs)}mph ${dir}`;
}

function crosswindLabel(crosswindMph: number): string {
  const abs = Math.abs(crosswindMph);
  if (abs < 1) return '';
  const dir = crosswindMph > 0 ? 'L\u2192R' : 'R\u2192L';
  return `${Math.round(abs)}mph ${dir}`;
}

function adjustLabel(yards: number): string {
  if (yards === 0) return 'no change';
  return yards > 0 ? `${yards}y longer` : `${Math.abs(yards)}y shorter`;
}

export function WeatherBanner({ weather, adjustment, courseTotalAdjust, viewMode }: WeatherBannerProps) {
  const adjustYards = viewMode === 'hole' ? (adjustment?.carryAdjustYards ?? 0) : courseTotalAdjust;
  const isLonger = adjustYards > 0;
  const accentColor = adjustYards === 0 ? 'text-ink-light' : isLonger ? 'text-red-400' : 'text-emerald-400';

  return (
    <div className="rounded-sm bg-card backdrop-blur-[8px] border border-card-border px-3 py-2">
      {/* Row 1: conditions */}
      <div className="flex items-center gap-3 text-xs text-ink-light font-mono tracking-wide">
        <span className="text-ink">{Math.round(weather.temperature)}&deg;F</span>
        <span className="text-ink-faint">&middot;</span>
        <span>Wind {Math.round(weather.windSpeed)}mph {weather.windCardinal}</span>
        {weather.windGust > weather.windSpeed + 3 && (
          <span className="text-ink-faint">(gusts {Math.round(weather.windGust)})</span>
        )}
        <span className="text-ink-faint">&middot;</span>
        <span>{weather.humidity}% humidity</span>
      </div>

      {/* Row 2: adjustment */}
      <div className={`mt-1 text-xs font-mono tracking-wide ${accentColor}`}>
        {viewMode === 'hole' && adjustment ? (
          <span>
            Hole {adjustment.holeNumber}: {windLabel(adjustment.headwindMph)}
            {crosswindLabel(adjustment.crosswindMph) && (
              <span className="text-ink-faint">, {crosswindLabel(adjustment.crosswindMph)}</span>
            )}
            <span className="text-ink-faint"> &mdash; </span>
            plays {adjustment.playsLikeYardage}y ({adjustLabel(adjustment.carryAdjustYards)})
          </span>
        ) : (
          <span>Course plays {adjustLabel(adjustYards)} with weather</span>
        )}
      </div>
    </div>
  );
}
