import { useMemo } from 'react';
import { useYardageBookShots } from './useYardageBook';
import { buildDistributions, findBestApproaches } from '../services/monte-carlo';
import { projectPoint, computeEllipsePoints } from '../utils/geo';
import type { ClubDistribution, ApproachStrategy } from '../services/monte-carlo';
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

    const sigma1 = computeEllipsePoints(center, bearing, dist.stdCarry, dist.stdOffline, 36);
    const sigma2 = computeEllipsePoints(center, bearing, dist.stdCarry * 2, dist.stdOffline * 2, 36);

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

export function useHoleStrategy(
  hole: CourseHole | undefined,
  teeBox: string,
  enabled: boolean,
  selectedStrategyIdx: number,
): {
  strategies: ApproachStrategy[];
  distributions: ClubDistribution[];
  landingZones: LandingZone[];
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
    if (!enabled || distributions.length === 0 || distance === 0) return [];
    return findBestApproaches(distance, distributions);
  }, [enabled, distributions, distance]);

  const landingZones = useMemo(() => {
    if (!enabled || !hole || strategies.length === 0) return [];
    const idx = Math.min(selectedStrategyIdx, strategies.length - 1);
    return computeLandingZones(
      strategies[idx],
      distributions,
      { lat: hole.tee.lat, lng: hole.tee.lng },
      hole.heading,
    );
  }, [enabled, hole, strategies, distributions, selectedStrategyIdx]);

  return {
    strategies,
    distributions,
    landingZones,
    shotCount: totalShotCount,
    isLoading,
  };
}
