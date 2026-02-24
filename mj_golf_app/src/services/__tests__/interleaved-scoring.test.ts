import {
  computeRemaining,
  checkApproachMilestone,
  getScoreLabel,
  computeScoringZone,
  computeHoleScore,
} from '../interleaved-scoring';
import type { InterleavedHole } from '../../models/session';

function makeHole(overrides: Partial<InterleavedHole> = {}): InterleavedHole {
  return { number: 1, distanceYards: 400, par: 4, ...overrides };
}

// ── computeRemaining ─────────────────────────────────────────────────────────

describe('computeRemaining', () => {
  it('returns hole distance when shots array is empty', () => {
    const r = computeRemaining(400, []);
    expect(r.trueRemaining).toBe(400);
    expect(r.forwardRemaining).toBe(400);
    expect(r.cumulativeOffline).toBe(0);
  });

  it('reduces remaining by carry for a single straight shot', () => {
    const r = computeRemaining(400, [{ carryYards: 250, offlineYards: 0 }]);
    expect(r.trueRemaining).toBe(150);
    expect(r.forwardRemaining).toBe(150);
    expect(r.cumulativeOffline).toBe(0);
  });

  it('computes true remaining with pythagorean for offline shot', () => {
    const r = computeRemaining(400, [{ carryYards: 250, offlineYards: 30 }]);
    // forward = 400-250 = 150, true = sqrt(150² + 30²) = sqrt(23400) ≈ 152.97
    expect(r.trueRemaining).toBeCloseTo(153.0, 0);
    expect(r.forwardRemaining).toBe(150);
    expect(r.cumulativeOffline).toBe(30);
  });

  it('iteratively computes remaining for two shots aimed at hole', () => {
    const r = computeRemaining(400, [
      { carryYards: 250, offlineYards: 0 },
      { carryYards: 120, offlineYards: 10 },
    ]);
    // Shot 1: forward = 400-250 = 150, true = sqrt(150²+0) = 150
    // Shot 2: forward = 150-120 = 30, true = sqrt(30²+10²) = sqrt(1000) ≈ 31.62
    expect(r.trueRemaining).toBeCloseTo(31.6, 0);
    expect(r.forwardRemaining).toBe(30);
    expect(r.cumulativeOffline).toBe(10);
  });

  it('handles overshoot (carry exceeds true remaining)', () => {
    const r = computeRemaining(200, [{ carryYards: 250, offlineYards: 0 }]);
    // forward = 200-250 = -50, true = sqrt((-50)²+0) = 50
    expect(r.trueRemaining).toBe(50);
    expect(r.forwardRemaining).toBe(0);
  });

  it('handles overshoot with offline component', () => {
    const r = computeRemaining(200, [{ carryYards: 250, offlineYards: 20 }]);
    // forward = -50, true = sqrt(2500+400) = sqrt(2900) ≈ 53.85
    expect(r.trueRemaining).toBeCloseTo(53.9, 0);
    expect(r.forwardRemaining).toBe(0);
    expect(r.cumulativeOffline).toBe(20);
  });

  it('handles mixed positive and negative offline across shots', () => {
    const r = computeRemaining(400, [
      { carryYards: 200, offlineYards: 15 },
      { carryYards: 150, offlineYards: -10 },
    ]);
    // Shot 1: forward=200, true = sqrt(200²+15²) = sqrt(40225) ≈ 200.56
    // Shot 2: forward=200.56-150 = 50.56, true = sqrt(50.56²+10²) = sqrt(2556.3+100) ≈ 51.5
    expect(r.trueRemaining).toBeCloseTo(51.5, 0);
    expect(r.cumulativeOffline).toBe(5); // 15 + (-10)
    expect(r.forwardRemaining).toBe(50); // max(0, 400-200-150)
  });

  it('handles zero carry shot', () => {
    const r = computeRemaining(300, [{ carryYards: 0, offlineYards: 0 }]);
    expect(r.trueRemaining).toBe(300);
  });

  it('rounds trueRemaining to one decimal place', () => {
    // sqrt(150² + 30²) = sqrt(23400) = 152.9705...
    const r = computeRemaining(400, [{ carryYards: 250, offlineYards: 30 }]);
    expect(r.trueRemaining).toBe(Math.round(152.9706 * 10) / 10);
  });

  it('reproduces the bug-fix scenario: 450yd hole with 3 shots', () => {
    // The original bug: 200 carry 30R + 220 carry 10R + 45 carry 0 on 450-yd hole
    const r = computeRemaining(450, [
      { carryYards: 200, offlineYards: 30 },
      { carryYards: 220, offlineYards: 10 },
      { carryYards: 45, offlineYards: 0 },
    ]);
    // Shot 1: forward = 250, true = sqrt(250²+30²) = sqrt(63400) ≈ 251.79
    // Shot 2: forward = 251.79-220 = 31.79, true = sqrt(31.79²+10²) = sqrt(1110.7) ≈ 33.33
    // Shot 3: forward = 33.33-45 = -11.67, true = sqrt(136.2+0) ≈ 11.67
    expect(r.trueRemaining).toBeCloseTo(11.7, 0);
  });
});

// ── checkApproachMilestone ───────────────────────────────────────────────────

describe('checkApproachMilestone', () => {
  it('returns false for empty shots', () => {
    expect(checkApproachMilestone(makeHole(), [])).toBe(false);
  });

  it('returns false when not enough shots taken', () => {
    // Par 4: need 2 shots, only have 1
    expect(checkApproachMilestone(
      makeHole(),
      [{ carryYards: 200, offlineYards: 0 }],
    )).toBe(false);
  });

  it('returns true when 2 shots on par 4 bring remaining under 100', () => {
    expect(checkApproachMilestone(
      makeHole({ distanceYards: 400, par: 4 }),
      [
        { carryYards: 250, offlineYards: 0 },
        { carryYards: 80, offlineYards: 0 },
      ],
    )).toBe(true); // remaining = 70 < 100
  });

  it('returns false when 2 shots do not bring remaining under 100', () => {
    expect(checkApproachMilestone(
      makeHole({ distanceYards: 450, par: 4 }),
      [
        { carryYards: 200, offlineYards: 0 },
        { carryYards: 100, offlineYards: 0 },
      ],
    )).toBe(false); // remaining = 150 > 100
  });

  it('returns true for par 5 when 3 shots reach under 100', () => {
    expect(checkApproachMilestone(
      makeHole({ distanceYards: 500, par: 5 }),
      [
        { carryYards: 250, offlineYards: 0 },
        { carryYards: 150, offlineYards: 0 },
        { carryYards: 50, offlineYards: 0 },
      ],
    )).toBe(true); // remaining = 50 < 100
  });

  it('returns true for par 3 when 1 shot reaches under 100', () => {
    expect(checkApproachMilestone(
      makeHole({ distanceYards: 180, par: 3 }),
      [{ carryYards: 100, offlineYards: 0 }],
    )).toBe(true); // remaining = 80 < 100
  });

  it('returns false for par 3 when shot does not reach under 100', () => {
    expect(checkApproachMilestone(
      makeHole({ distanceYards: 200, par: 3 }),
      [{ carryYards: 80, offlineYards: 0 }],
    )).toBe(false); // remaining = 120 > 100
  });

  it('only checks first targetStrokes shots, ignoring extra', () => {
    // Par 4: checks first 2 shots only
    // First 2 shots leave 200 remaining, 3rd shot would reach but is ignored
    expect(checkApproachMilestone(
      makeHole({ distanceYards: 400, par: 4 }),
      [
        { carryYards: 100, offlineYards: 0 },
        { carryYards: 100, offlineYards: 0 },
        { carryYards: 150, offlineYards: 0 },
      ],
    )).toBe(false); // after 2 shots: 200 remaining > 100
  });
});

// ── getScoreLabel ────────────────────────────────────────────────────────────

describe('getScoreLabel', () => {
  it('returns Albatross for toPar -3', () => {
    expect(getScoreLabel(-3)).toBe('Albatross');
  });

  it('returns Albatross for toPar -4', () => {
    expect(getScoreLabel(-4)).toBe('Albatross');
  });

  it('returns Eagle for toPar -2', () => {
    expect(getScoreLabel(-2)).toBe('Eagle');
  });

  it('returns Birdie for toPar -1', () => {
    expect(getScoreLabel(-1)).toBe('Birdie');
  });

  it('returns Par for toPar 0', () => {
    expect(getScoreLabel(0)).toBe('Par');
  });

  it('returns Bogey for toPar 1', () => {
    expect(getScoreLabel(1)).toBe('Bogey');
  });

  it('returns Double for toPar 2', () => {
    expect(getScoreLabel(2)).toBe('Double');
  });

  it('returns Triple for toPar 3', () => {
    expect(getScoreLabel(3)).toBe('Triple');
  });

  it('returns +N for toPar > 3', () => {
    expect(getScoreLabel(4)).toBe('+4');
    expect(getScoreLabel(7)).toBe('+7');
  });
});

// ── computeScoringZone ───────────────────────────────────────────────────────

describe('computeScoringZone', () => {
  it('returns not applicable when hole distance <= 100', () => {
    const sz = computeScoringZone(makeHole({ distanceYards: 90, par: 3 }), []);
    expect(sz.applicable).toBe(false);
    expect(sz.target).toBe(1);
  });

  it('finds the first shot that brings remaining under 100', () => {
    const sz = computeScoringZone(
      makeHole({ distanceYards: 400, par: 4 }),
      [{ carryYards: 350, offlineYards: 0 }],
    );
    // After 1 shot: remaining = 50 < 100
    expect(sz).toEqual({ target: 2, actual: 1, delta: -1, applicable: true });
  });

  it('returns actual = shots.length when no shot reaches 100', () => {
    const sz = computeScoringZone(
      makeHole({ distanceYards: 400, par: 4 }),
      [
        { carryYards: 100, offlineYards: 0 },
        { carryYards: 100, offlineYards: 0 },
      ],
    );
    // After 1: 300, After 2: 200 — never reaches 100
    expect(sz).toEqual({ target: 2, actual: 2, delta: 0, applicable: true });
  });

  it('handles par 5 with correct target', () => {
    const sz = computeScoringZone(
      makeHole({ distanceYards: 500, par: 5 }),
      [
        { carryYards: 250, offlineYards: 0 },
        { carryYards: 200, offlineYards: 0 },
      ],
    );
    // After 2: remaining = 50 < 100
    expect(sz).toEqual({ target: 3, actual: 2, delta: -1, applicable: true });
  });

  it('handles par 3 with distance > 100', () => {
    const sz = computeScoringZone(
      makeHole({ distanceYards: 180, par: 3 }),
      [{ carryYards: 100, offlineYards: 0 }],
    );
    // After 1: remaining = 80 < 100
    expect(sz).toEqual({ target: 1, actual: 1, delta: 0, applicable: true });
  });
});

// ── computeHoleScore ─────────────────────────────────────────────────────────

describe('computeHoleScore', () => {
  it('always adds 2 putts to shot count', () => {
    const score = computeHoleScore(
      makeHole({ par: 4 }),
      [
        { carryYards: 250, offlineYards: 0 },
        { carryYards: 145, offlineYards: 0 },
      ],
    );
    expect(score.strokes).toBe(2);
    expect(score.putts).toBe(2);
    expect(score.total).toBe(4);
    expect(score.toPar).toBe(0);
    expect(score.label).toBe('Par');
  });

  it('computes birdie for 1 shot on par 4', () => {
    const score = computeHoleScore(
      makeHole({ par: 4 }),
      [{ carryYards: 395, offlineYards: 0 }],
    );
    expect(score.total).toBe(3); // 1 + 2
    expect(score.toPar).toBe(-1);
    expect(score.label).toBe('Birdie');
  });

  it('includes approachMade and scoringZone', () => {
    const score = computeHoleScore(
      makeHole({ distanceYards: 400, par: 4 }),
      [
        { carryYards: 250, offlineYards: 0 },
        { carryYards: 80, offlineYards: 0 },
      ],
    );
    expect(score.approachMade).toBe(true);
    expect(score.scoringZone.applicable).toBe(true);
  });

  it('handles zero shots edge case', () => {
    const score = computeHoleScore(makeHole({ par: 4 }), []);
    expect(score.strokes).toBe(0);
    expect(score.total).toBe(2); // 0 + 2
    expect(score.toPar).toBe(-2); // 2 - 4
    expect(score.label).toBe('Eagle');
  });
});
