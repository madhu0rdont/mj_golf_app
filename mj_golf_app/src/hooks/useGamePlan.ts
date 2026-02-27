import { useState, useCallback } from 'react';
import { generateGamePlan } from '../services/game-plan';
import type { GamePlan } from '../services/game-plan';
import type { ClubDistribution } from '../services/monte-carlo';
import type { CourseWithHoles } from '../models/course';
import type { StrategyMode } from '../services/strategy-optimizer';

export function useGamePlan(
  course: CourseWithHoles | undefined,
  teeBox: string,
  distributions: ClubDistribution[],
  mode: StrategyMode,
) {
  const [gamePlan, setGamePlan] = useState<GamePlan | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = useCallback(async () => {
    if (!course || distributions.length === 0) return;

    setIsGenerating(true);
    setGamePlan(null);
    setProgress({ current: 0, total: course.holes.length });

    try {
      const plan = await generateGamePlan(course, teeBox, distributions, mode, (current, total) => {
        setProgress({ current, total });
      });
      setGamePlan(plan);
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  }, [course, teeBox, distributions, mode]);

  return { gamePlan, progress, isGenerating, generate };
}
