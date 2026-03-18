import { useMemo } from 'react';
import useSWR from 'swr';
import { useYardageBookShots } from './useYardageBook';
import { api } from '../lib/api';
import { projectPoint, computeEllipsePoints, bearingBetween, polygonCentroid } from '../utils/geo';
import type { ClubDistribution, ApproachStrategy } from '../services/monte-carlo';
import type { OptimizedStrategy, AimPoint } from '../services/strategy-optimizer';
import type { CourseHole } from '../models/course';

export interface LandingZone {
  clubName: string;
  center: { lat: number; lng: number };
  sigma1: { lat: number; lng: number }[]; // 1σ ellipse polygon
  sigma2: { lat: number; lng: number }[]; // 2σ ellipse polygon
}

/** Pure function: compute landing zone ellipses for a strategy's club sequence */
export function computeLandingZones(
  strategy: ApproachStrategy | undefined,
  distributions: ClubDistribution[],
  tee: { lat: number; lng: number },
  bearing: number,
): LandingZone[] {
  if (!strategy || distributions.length === 0) return [];

  const zones: LandingZone[] = [];
  let currentPos = { lat: tee.lat, lng: tee.lng };

  for (const clubRef of strategy.clubs) {
    const dist = distributions.find((d) => d.clubId === clubRef.clubId);
    if (!dist) continue;

    // Project center along bearing by meanCarry
    let center = projectPoint(currentPos, bearing, dist.meanCarry);

    // Shift perpendicular by meanOffline if nonzero (positive = right of bearing)
    if (Math.abs(dist.meanOffline) > 0.5) {
      const perpBearing = bearing + 90; // right of line
      center = projectPoint(center, perpBearing, dist.meanOffline);
    }

    const carryAxis = dist.stdCarry;
    const offlineAxis = dist.stdOffline;
    const sigma1 = computeEllipsePoints(center, bearing, carryAxis, offlineAxis, 36);
    const sigma2 = computeEllipsePoints(center, bearing, carryAxis * 2, offlineAxis * 2, 36);

    zones.push({
      clubName: dist.clubName,
      center,
      sigma1,
      sigma2,
    });

    // Chain: next club starts from this landing center
    currentPos = center;
  }

  return zones;
}

/** Compute landing zone ellipses from OptimizedStrategy aimPoints.
 *  The server already applies meanOffline compensation, so aimPoint.position
 *  represents the expected landing position (where the ball actually lands). */
export function computeLandingZonesFromAimPoints(
  strategy: OptimizedStrategy,
  distributions: ClubDistribution[],
  heading: number,
  tee?: { lat: number; lng: number },
  fairway?: { lat: number; lng: number }[][],
  green?: { lat: number; lng: number }[],
): LandingZone[] {
  const zones: LandingZone[] = [];

  // Compute centroid targets for bearing reference
  const fwCentroid = fairway && fairway.length > 0
    ? polygonCentroid(fairway.flat())
    : null;
  const grCentroid = green && green.length >= 3
    ? polygonCentroid(green)
    : null;

  let shotOrigin = tee ?? null;

  for (let i = 0; i < strategy.aimPoints.length; i++) {
    const aim = strategy.aimPoints[i];
    const dist = distributions.find((d) => d.clubName === aim.clubName);
    if (!dist) continue;

    // Per-shot bearing using centroid targets
    const isLast = i === strategy.aimPoints.length - 1;
    let shotHeading = heading; // fallback
    if (shotOrigin) {
      const target = isLast && grCentroid ? grCentroid : fwCentroid;
      if (target) {
        shotHeading = bearingBetween(shotOrigin, target);
      }
    }

    // Server already applies meanOffline — use position directly
    const center = aim.position;

    const carryAxis = dist.stdCarry;
    const offlineAxis = dist.stdOffline;
    const sigma1 = computeEllipsePoints(center, shotHeading, carryAxis, offlineAxis, 36);
    const sigma2 = computeEllipsePoints(center, shotHeading, carryAxis * 2, offlineAxis * 2, 36);

    zones.push({
      clubName: aim.clubName,
      center,
      sigma1,
      sigma2,
    });

    // Chain: next shot starts from this landing center
    shotOrigin = center;
  }

  return zones;
}

interface StrategyResponse {
  strategies: OptimizedStrategy[];
  distributions: ClubDistribution[];
}

export function useHoleStrategy(
  hole: CourseHole | undefined,
  teeBox: string,
  enabled: boolean,
  selectedStrategyIdx: number,
): {
  strategies: ApproachStrategy[];
  distributions: ClubDistribution[];
  landingZones: LandingZone[];
  aimPoints: AimPoint[];
  shotCount: number;
  isLoading: boolean;
  regenerate: () => Promise<unknown>;
} {
  // Still use local shot count for gating the "Run Sim" button
  const shotGroups = useYardageBookShots();
  const totalShotCount = useMemo(() => {
    if (!shotGroups) return 0;
    return shotGroups
      .filter((g) => !g.imputed)
      .reduce((sum, g) => sum + g.shots.length, 0);
  }, [shotGroups]);

  // Fetch strategies from server via POST (SWR with a stable key)
  const swrKey = enabled && hole ? `strategy:${hole.courseId}:${hole.holeNumber}:${teeBox}` : null;
  const { data, isLoading: isStrategyLoading, mutate: mutateStrategy } = useSWR<StrategyResponse>(
    swrKey,
    () => api.post<StrategyResponse>('/strategy/hole', {
      courseId: hole!.courseId,
      holeNumber: hole!.holeNumber,
      teeBox,
    }),
    { revalidateOnFocus: false },
  );

  const strategies = data?.strategies ?? [];
  const distributions = data?.distributions ?? [];
  const isLoading = shotGroups === undefined || (enabled && isStrategyLoading);

  const landingZones = useMemo(() => {
    if (!enabled || !hole || strategies.length === 0) return [];
    const idx = Math.min(selectedStrategyIdx, strategies.length - 1);
    const strategy = strategies[idx];

    const heading = bearingBetween(hole.tee, hole.pin);

    // Use aim-point based zones for OptimizedStrategy, fall back for plain ApproachStrategy
    if ('aimPoints' in strategy && (strategy as OptimizedStrategy).aimPoints.length > 0) {
      return computeLandingZonesFromAimPoints(
        strategy as OptimizedStrategy,
        distributions,
        heading,
        { lat: hole.tee.lat, lng: hole.tee.lng },
        hole.fairway,
        hole.green,
      );
    }

    return computeLandingZones(
      strategy,
      distributions,
      { lat: hole.tee.lat, lng: hole.tee.lng },
      heading,
    );
  }, [enabled, hole, strategies, distributions, selectedStrategyIdx]);

  const aimPoints = useMemo(() => {
    if (!enabled || strategies.length === 0) return [];
    const idx = Math.min(selectedStrategyIdx, strategies.length - 1);
    const strategy = strategies[idx];
    if ('aimPoints' in strategy) {
      return (strategy as OptimizedStrategy).aimPoints;
    }
    return [];
  }, [enabled, strategies, selectedStrategyIdx]);

  return {
    strategies,
    distributions,
    landingZones,
    aimPoints,
    shotCount: totalShotCount,
    isLoading,
    regenerate: mutateStrategy,
  };
}
