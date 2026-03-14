import crypto from 'node:crypto';
import { query } from '../db.js';
import type { GamePlan, HolePlan } from './game-plan.js';
import type { OptimizedStrategy, ScoreDistribution, AimPoint } from './strategy-optimizer.js';

// ---------------------------------------------------------------------------
// Types for raw DB rows
// ---------------------------------------------------------------------------

interface RunRow {
  id: string;
  total_expected: number;
  trigger_reason: string | null;
  created_at: number;
}

interface RunHoleRow {
  id: string;
  run_id: string;
  hole_number: number;
  par: number;
  yardage: number;
  plays_like_yardage: number | null;
  expected_strokes: number;
  strategy_name: string;
  strategy_type: string;
  strategy_label: string | null;
  blowup_risk: number | null;
  std_strokes: number | null;
  fairway_rate: number | null;
  color_code: string | null;
  eagle_pct: number | null;
  birdie_pct: number | null;
  par_pct: number | null;
  bogey_pct: number | null;
  double_pct: number | null;
  worse_pct: number | null;
}

interface AimPointRow {
  run_hole_id: string;
  shot_number: number;
  club_name: string;
  carry: number;
  carry_note: string | null;
  tip: string | null;
  lat: number;
  lng: number;
}

// Public summary type returned by loadRunHistory
export interface RunSummary {
  id: string;
  totalExpected: number;
  triggerReason: string | null;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Read: list history entries (summary only, for charting)
// ---------------------------------------------------------------------------

export async function loadRunHistory(
  userId: string,
  courseId: string,
  teeBox: string,
  mode: string,
  limit = 100,
): Promise<RunSummary[]> {
  const { rows } = await query(
    `SELECT id, total_expected, trigger_reason, created_at
     FROM optimizer_runs
     WHERE user_id = $1 AND course_id = $2 AND tee_box = $3 AND mode = $4
     ORDER BY created_at DESC
     LIMIT $5`,
    [userId, courseId, teeBox, mode, limit],
  );
  return (rows as RunRow[]).map(r => ({
    id: r.id,
    totalExpected: r.total_expected,
    triggerReason: r.trigger_reason,
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Read: full historical plan detail (assembled from normalized tables)
// ---------------------------------------------------------------------------

export async function loadRunDetail(
  userId: string,
  runId: string,
): Promise<GamePlan | null> {
  // 1. Fetch the run itself
  const { rows: runRows } = await query(
    `SELECT id, course_name, tee_box, total_expected, total_plays_like, plan_payload, created_at
     FROM optimizer_runs WHERE id = $1 AND user_id = $2`,
    [runId, userId],
  );
  if (runRows.length === 0) return null;

  const run = runRows[0];

  // If plan_payload exists, use it directly for backward compat (full fidelity)
  if (run.plan_payload) {
    const plan = typeof run.plan_payload === 'string' ? JSON.parse(run.plan_payload) : run.plan_payload;
    return plan as GamePlan;
  }

  // Otherwise assemble from normalized tables
  const { rows: holeRows } = await query(
    `SELECT * FROM optimizer_run_holes WHERE run_id = $1 ORDER BY hole_number`,
    [runId],
  );

  if (holeRows.length === 0) return null;

  const holeIds = (holeRows as RunHoleRow[]).map(h => h.id);
  const { rows: aimRows } = await query(
    `SELECT * FROM optimizer_run_aim_points WHERE run_hole_id = ANY($1) ORDER BY shot_number`,
    [holeIds],
  );

  const aimsByHole = new Map<string, AimPointRow[]>();
  for (const ap of aimRows as AimPointRow[]) {
    const list = aimsByHole.get(ap.run_hole_id) || [];
    list.push(ap);
    aimsByHole.set(ap.run_hole_id, list);
  }

  const holes: HolePlan[] = (holeRows as RunHoleRow[]).map(h => {
    const aimPoints: AimPoint[] = (aimsByHole.get(h.id) || []).map(ap => ({
      position: { lat: ap.lat, lng: ap.lng },
      clubName: ap.club_name,
      shotNumber: ap.shot_number,
      carry: ap.carry,
      carryNote: ap.carry_note,
      tip: ap.tip ?? '',
    }));

    const scoreDistribution: ScoreDistribution = {
      eagle: h.eagle_pct ?? 0,
      birdie: h.birdie_pct ?? 0,
      par: h.par_pct ?? 0,
      bogey: h.bogey_pct ?? 0,
      double: h.double_pct ?? 0,
      worse: h.worse_pct ?? 0,
    };

    const strategy: OptimizedStrategy = {
      clubs: [],
      expectedStrokes: h.expected_strokes,
      label: h.strategy_label ?? '',
      strategyName: h.strategy_name,
      strategyType: h.strategy_type as 'scoring' | 'safe' | 'balanced',
      scoreDistribution,
      blowupRisk: h.blowup_risk ?? 0,
      stdStrokes: h.std_strokes ?? 0,
      fairwayRate: h.fairway_rate ?? 0,
      aimPoints,
    };

    return {
      holeNumber: h.hole_number,
      par: h.par,
      yardage: h.yardage,
      playsLikeYardage: h.plays_like_yardage,
      strategy,
      allStrategies: [strategy],
      colorCode: (h.color_code as 'green' | 'yellow' | 'red') ?? 'yellow',
    };
  });

  const createdDate = new Date(run.created_at);
  return {
    courseName: run.course_name ?? '',
    teeBox: run.tee_box,
    date: createdDate.toISOString().slice(0, 10),
    totalExpected: run.total_expected,
    breakdown: aggregateDistribution(holes),
    keyHoles: [],
    totalPlaysLike: run.total_plays_like ?? 0,
    holes,
  };
}

function aggregateDistribution(holes: HolePlan[]): ScoreDistribution {
  const agg: ScoreDistribution = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, worse: 0 };
  for (const h of holes) {
    agg.eagle += h.strategy.scoreDistribution.eagle;
    agg.birdie += h.strategy.scoreDistribution.birdie;
    agg.par += h.strategy.scoreDistribution.par;
    agg.bogey += h.strategy.scoreDistribution.bogey;
    agg.double += h.strategy.scoreDistribution.double;
    agg.worse += h.strategy.scoreDistribution.worse;
  }
  return agg;
}

// ---------------------------------------------------------------------------
// Write: insert a new optimizer run (writes to all 3 tables)
// ---------------------------------------------------------------------------

export async function insertOptimizerRun(
  userId: string,
  courseId: string,
  teeBox: string,
  mode: string,
  plan: GamePlan,
  triggerReason: string,
): Promise<string> {
  const runId = crypto.randomUUID();
  const now = Date.now();

  // 1. Insert optimizer_runs
  await query(
    `INSERT INTO optimizer_runs (id, user_id, course_id, tee_box, mode, total_expected, total_plays_like, course_name, trigger_reason, plan_payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [runId, userId, courseId, teeBox, mode, plan.totalExpected, plan.totalPlaysLike, plan.courseName, triggerReason, JSON.stringify(plan), now],
  );

  // 2. Insert optimizer_run_holes
  for (const hole of plan.holes) {
    const holeId = crypto.randomUUID();
    const s = hole.strategy;
    const sd = s.scoreDistribution;

    await query(
      `INSERT INTO optimizer_run_holes (id, run_id, hole_number, par, yardage, plays_like_yardage,
        expected_strokes, strategy_name, strategy_type, strategy_label,
        blowup_risk, std_strokes, fairway_rate, color_code,
        eagle_pct, birdie_pct, par_pct, bogey_pct, double_pct, worse_pct)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [holeId, runId, hole.holeNumber, hole.par, hole.yardage, hole.playsLikeYardage,
       s.expectedStrokes, s.strategyName, s.strategyType, s.label ?? null,
       s.blowupRisk, s.stdStrokes, s.fairwayRate, hole.colorCode,
       sd.eagle, sd.birdie, sd.par, sd.bogey, sd.double, sd.worse],
    );

    // 3. Insert optimizer_run_aim_points
    for (const ap of s.aimPoints) {
      await query(
        `INSERT INTO optimizer_run_aim_points (id, run_hole_id, shot_number, club_name, carry, carry_note, tip, lat, lng)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [crypto.randomUUID(), holeId, ap.shotNumber, ap.clubName, ap.carry, ap.carryNote, ap.tip, ap.position.lat, ap.position.lng],
      );
    }
  }

  return runId;
}
