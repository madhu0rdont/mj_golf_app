import { useState, useCallback, useRef } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { fetcher } from '../lib/fetcher';
import { api } from '../lib/api';
import { generateGamePlan } from '../services/game-plan';
import type { GamePlan } from '../services/game-plan';
import type { ClubDistribution } from '../services/monte-carlo';
import type { CourseWithHoles } from '../models/course';
import type { StrategyMode } from '../services/strategy-optimizer';

interface CachedPlanRow {
  id: string;
  courseId: string;
  teeBox: string;
  mode: string;
  plan: GamePlan;
  stale: boolean;
  staleReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export function useGamePlanCache(
  course: CourseWithHoles | undefined,
  teeBox: string,
  distributions: ClubDistribution[],
  mode: StrategyMode,
) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const staleRef = useRef(false);

  const cacheKey = course ? `/api/game-plans/${course.id}/${teeBox}/${mode}` : null;

  const { data, isLoading: isFetching } = useSWR<CachedPlanRow | null>(
    cacheKey,
    async (url: string) => {
      try {
        return await fetcher<CachedPlanRow>(url);
      } catch (err) {
        // 404 means no cache — return null so SWR clears previous key's data
        if (err instanceof Error && err.message.includes('404')) return null;
        throw err;
      }
    },
    { refreshInterval: () => staleRef.current ? 3000 : 0 },
  );

  // Keep ref in sync for SWR's refreshInterval callback
  staleRef.current = data?.stale ?? false;

  const gamePlan = data?.plan ?? null;
  const isStale = data?.stale ?? false;
  const staleReason = data?.staleReason ?? null;
  const cacheAge = data?.updatedAt ? Date.now() - data.updatedAt : null;

  const generate = useCallback(async () => {
    if (!course || distributions.length === 0) return;

    setIsGenerating(true);
    setProgress({ current: 0, total: course.holes.length });

    try {
      const plan = await generateGamePlan(course, teeBox, distributions, mode, (current, total) => {
        setProgress({ current, total });
      });

      // Save to server
      await api.put(`/game-plans/${course.id}/${teeBox}/${mode}`, { plan });

      // Revalidate SWR cache
      if (cacheKey) {
        await globalMutate(cacheKey);
      }
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  }, [course, teeBox, distributions, mode, cacheKey]);

  return {
    gamePlan,
    isStale,
    staleReason,
    isFetching,
    isGenerating,
    progress,
    generate,
    cacheAge,
  };
}
