import { useState, useEffect, useMemo } from 'react';
import type { Shot } from '../../models/session';
import { computeXScale } from './flight-math';
import { MetricsBar } from './MetricsBar';
import { TrajectoryChart } from './TrajectoryChart';
import { DispersionChart } from './DispersionChart';

interface SessionFlightViewProps {
  shots: Shot[];
  clubName: string;
  sessionDate: Date;
  highlightedShotId?: string;
}

export function SessionFlightView({
  shots,
  clubName: _clubName,
  sessionDate: _sessionDate,
  highlightedShotId: externalHighlight,
}: SessionFlightViewProps) {
  const [highlightedId, setHighlightedId] = useState<string | null>(
    externalHighlight ?? null
  );
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (externalHighlight !== undefined) setHighlightedId(externalHighlight);
  }, [externalHighlight]);

  const hasTrajectoryData = shots.some(
    (s) => s.launchAngle != null && s.apexHeight != null
  );

  const xScale = useMemo(() => computeXScale(shots), [shots]);

  return (
    <div className="mb-4 rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
      {/* Metrics Bar */}
      <div
        className={`transition-opacity duration-500 ${animated ? 'opacity-100' : 'opacity-0'}`}
      >
        <MetricsBar shots={shots} highlightedShotId={highlightedId} />
      </div>

      {hasTrajectoryData ? (
        <>
          {/* Side-View Trajectory */}
          <div
            className={`transition-opacity duration-700 ${animated ? 'opacity-100' : 'opacity-0'}`}
            style={{ transitionDelay: '200ms' }}
          >
            <TrajectoryChart
              shots={shots}
              highlightedShotId={highlightedId}
              onShotTap={setHighlightedId}
              xScale={xScale}
              animated={animated}
            />
          </div>

          {/* Top-Down Dispersion */}
          <div
            className={`transition-opacity duration-700 ${animated ? 'opacity-100' : 'opacity-0'}`}
            style={{ transitionDelay: '500ms' }}
          >
            <DispersionChart
              shots={shots}
              highlightedShotId={highlightedId}
              onShotTap={setHighlightedId}
              xScale={xScale}
              animated={animated}
            />
          </div>
        </>
      ) : (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-text-muted">
            Trajectory data not available for this session.
          </p>
          <p className="mt-1 text-[10px] text-text-faint">
            Import data with launch angle and apex height to see flight paths.
          </p>
        </div>
      )}
    </div>
  );
}
