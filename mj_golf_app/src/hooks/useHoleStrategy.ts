import { useMemo } from 'react';
import { useYardageBookShots } from './useYardageBook';
import { buildDistributions } from '../services/monte-carlo';
import { optimizeHole } from '../services/strategy-optimizer';
import { projectPoint, computeEllipsePoints, bearingBetween } from '../utils/geo';
import type { ClubDistribution, ApproachStrategy } from '../services/monte-carlo';
import type { OptimizedStrategy, StrategyMode, AimPoint } from '../services/strategy-optimizer';
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

    // Ensure carry axis is at least 1.5× offline for a visibly elongated oval
    const carryAxis = Math.max(dist.stdCarry, dist.stdOffline * 1.5);
    const offlineAxis = dist.stdOffline;
    const sigma1 = computeEllipsePoints(center, bearing, carryAxis * 1.5, offlineAxis * 1.5, 36);
    const sigma2 = computeEllipsePoints(center, bearing, carryAxis * 3, offlineAxis * 3, 36);

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

/** Compute landing zone ellipses from OptimizedStrategy aimPoints instead of projecting from tee.
 *  Aim points represent where to AIM; ellipses are offset by meanOffline to show
 *  where the ball actually lands given the player's lateral bias. */
export function computeLandingZonesFromAimPoints(
  strategy: OptimizedStrategy,
  distributions: ClubDistribution[],
  heading: number,
): LandingZone[] {
  const zones: LandingZone[] = [];

  for (const aim of strategy.aimPoints) {
    const dist = distributions.find((d) => d.clubName === aim.clubName);
    if (!dist) continue;

    // Shift ellipse center by meanOffline to show expected landing position
    let center = aim.position;
    if (Math.abs(dist.meanOffline) > 0.5) {
      center = projectPoint(center, heading + 90, dist.meanOffline);
    }

    // Ensure carry axis is at least 1.5× offline for a visibly elongated oval
    const carryAxis = Math.max(dist.stdCarry, dist.stdOffline * 1.5);
    const offlineAxis = dist.stdOffline;
    const sigma1 = computeEllipsePoints(center, heading, carryAxis * 1.5, offlineAxis * 1.5, 36);
    const sigma2 = computeEllipsePoints(center, heading, carryAxis * 3, offlineAxis * 3, 36);

    zones.push({
      clubName: aim.clubName,
      center,
      sigma1,
      sigma2,
    });
  }

  return zones;
}

export function useHoleStrategy(
  hole: CourseHole | undefined,
  teeBox: string,
  enabled: boolean,
  selectedStrategyIdx: number,
  mode: StrategyMode = 'scoring',
): {
  strategies: ApproachStrategy[];
  distributions: ClubDistribution[];
  landingZones: LandingZone[];
  aimPoints: AimPoint[];
  shotCount: number;
  isLoading: boolean;
} {
  const shotGroups = useYardageBookShots();
  const isLoading = shotGroups === undefined;

  const totalShotCount = useMemo(() => {
    if (!shotGroups) return 0;
    return shotGroups
      .filter((g) => !g.imputed)
      .reduce((sum, g) => sum + g.shots.length, 0);
  }, [shotGroups]);

  const distributions = useMemo(() => {
    if (!enabled || !shotGroups) return [];
    return buildDistributions(shotGroups);
  }, [enabled, shotGroups]);

  const distance = useMemo(() => {
    if (!hole) return 0;
    // Prefer plays-like yardage (elevation-adjusted), fall back to raw
    return hole.playsLikeYards?.[teeBox] ?? hole.yardages[teeBox] ?? Object.values(hole.yardages)[0] ?? 0;
  }, [hole, teeBox]);

  const strategies = useMemo(() => {
    if (!enabled || distributions.length === 0 || distance === 0 || !hole) return [];
    return optimizeHole(hole, teeBox, distributions, mode);
  }, [enabled, distributions, distance, hole, teeBox, mode]);

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
  };
}
