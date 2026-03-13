import { useState, useCallback, useRef, useEffect } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { fetcher } from '../lib/fetcher';
import type { GamePlan } from '../services/game-plan';
import type { CourseWithHoles } from '../models/course';

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
) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const staleRef = useRef(false);
  const pollCountRef = useRef(0);

  const cacheKey = course ? `/api/game-plans/${course.id}/${teeBox}/scoring` : null;

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
    {
      // Exponential backoff when stale: 3s, 6s, 12s, 24s, capped at 30s
      refreshInterval: () => {
        if (!staleRef.current) {
          pollCountRef.current = 0;
          return 0;
        }
        const interval = Math.min(3000 * Math.pow(2, pollCountRef.current), 30000);
        pollCountRef.current++;
        return interval;
      },
    },
  );

  // Keep ref in sync for SWR's refreshInterval callback
  staleRef.current = data?.stale ?? false;
  if (!data?.stale) pollCountRef.current = 0;

  // Revalidate handicap when auto-regeneration completes (stale → fresh)
  const prevStaleRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (prevStaleRef.current === true && data?.stale === false) {
      globalMutate('/api/game-plans/handicap');
    }
    prevStaleRef.current = data?.stale;
  }, [data?.stale]);

  const gamePlan = data?.plan ?? null;
  const isStale = data?.stale ?? false;
  const staleReason = data?.staleReason ?? null;
  const cacheAge = data?.updatedAt ? Date.now() - data.updatedAt : null;

  const generate = useCallback(async () => {
    if (!course) return;

    setIsGenerating(true);
    setProgress({ current: 0, total: course.holes.length });

    try {
      // Generate plan on server via SSE for per-hole progress
      const res = await fetch(`/api/game-plans/${course.id}/${teeBox}/scoring/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: '{}',
      });

      if (!res.ok) throw new Error(`API ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Parse SSE lines
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              try {
                const msg = JSON.parse(line.slice(6));
                if (msg.type === 'progress') {
                  setProgress({ current: msg.completed, total: msg.total });
                }
              } catch { /* skip malformed */ }
            }
          }
        } catch (streamErr) {
          console.error('SSE stream interrupted', streamErr);
        }
      }

      // Revalidate SWR cache + handicap
      if (cacheKey) {
        await globalMutate(cacheKey);
      }
      await globalMutate('/api/game-plans/handicap');
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  }, [course, teeBox, cacheKey]);

  const regenerateHole = useCallback(async (holeNumber: number) => {
    if (!course) return;

    const res = await fetch(`/api/game-plans/${course.id}/${teeBox}/scoring/generate/${holeNumber}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: '{}',
    });

    if (!res.ok) throw new Error(`API ${res.status}`);

    // Revalidate SWR caches
    if (cacheKey) {
      await globalMutate(cacheKey);
    }
    // Also invalidate the per-hole strategy cache so sim view picks up new data
    await globalMutate(
      (key: string) => typeof key === 'string' && key.startsWith(`strategy:${course.id}:${holeNumber}:`),
      undefined,
      { revalidate: true },
    );
  }, [course, teeBox, cacheKey]);

  return {
    gamePlan,
    isStale,
    staleReason,
    isFetching,
    isGenerating,
    progress,
    generate,
    regenerateHole,
    cacheAge,
  };
}
