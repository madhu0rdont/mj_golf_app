import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { Loader2, Save, RotateCcw, Info, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { fetcher } from '../../lib/fetcher';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';

interface ConstantRow {
  key: string;
  value: number;
  category: string;
  description: string;
}

const CONSTANTS_KEY = '/api/admin/strategy-constants';

const CATEGORY_ORDER = [
  'lie', 'rollout', 'mode', 'sampling', 'threshold', 'spatial',
  'flight', 'putting', 'simulation', 'dp', 'club', 'hazard',
];

const CATEGORY_LABELS: Record<string, string> = {
  lie: 'Lie Multipliers',
  rollout: 'Surface Rollout',
  mode: 'Mode Weights',
  sampling: 'Sampling',
  threshold: 'Thresholds',
  spatial: 'Spatial Parameters',
  flight: 'Flight Model',
  putting: 'Putting Model',
  simulation: 'Simulation',
  dp: 'DP Convergence',
  club: 'Club Selection',
  hazard: 'Hazard',
};

// ---------------------------------------------------------------------------
// Math explanations per constant — rendered with KaTeX
// ---------------------------------------------------------------------------

interface MathInfo {
  title: string;
  explanation: string;
  /** KaTeX block formula (displayed centered) */
  formula?: string;
  /** Additional inline context after the formula */
  context?: string;
}

const CONSTANT_MATH: Record<string, MathInfo> = {
  // Lie multipliers
  lie_fairway: {
    title: 'Fairway Lie Multiplier',
    explanation: 'Scales shot dispersion (carry and offline std dev) when hitting from the fairway. Acts as the baseline — all other lie multipliers are relative to this.',
    formula: '\\sigma_{\\text{eff}} = \\sigma_{\\text{club}} \\times M_{\\text{lie}}',
    context: 'where M_lie = 1.0 for fairway. Higher values widen the Gaussian shot distribution.',
  },
  lie_rough: {
    title: 'Rough Lie Multiplier',
    explanation: 'Scales dispersion for shots from the rough. Rough reduces clubface control, increasing both carry and directional variance.',
    formula: '\\sigma_{\\text{carry}}^{\\text{rough}} = \\sigma_{\\text{carry}} \\times 1.15',
    context: 'A 15% increase over fairway dispersion reflects reduced contact consistency.',
  },
  lie_green: {
    title: 'Green Lie Multiplier',
    explanation: 'Scales dispersion for putts or chips from on the green surface. Typically identical to fairway (1.0) since green lies offer clean contact.',
    formula: '\\sigma_{\\text{eff}} = \\sigma_{\\text{club}} \\times 1.0',
  },
  lie_fairway_bunker: {
    title: 'Fairway Bunker Multiplier',
    explanation: 'Fairway bunkers require precise contact to avoid fat or thin shots, increasing dispersion significantly.',
    formula: '\\sigma_{\\text{eff}} = \\sigma_{\\text{club}} \\times 1.25',
    context: '25% wider dispersion than fairway. Applied to both carry std and offline std.',
  },
  lie_greenside_bunker: {
    title: 'Greenside Bunker Multiplier',
    explanation: 'Greenside bunkers require explosion shots with open-face technique. Less penalty than fairway bunkers since distances are shorter.',
    formula: '\\sigma_{\\text{eff}} = \\sigma_{\\text{club}} \\times 1.20',
  },
  lie_trees: {
    title: 'Trees Lie Multiplier',
    explanation: 'Recovery shots from trees face restricted backswing and limited target access, producing much higher dispersion.',
    formula: '\\sigma_{\\text{eff}} = \\sigma_{\\text{club}} \\times 1.40',
    context: '40% wider than fairway. Separate from tree trajectory collision detection.',
  },
  lie_recovery: {
    title: 'Recovery Lie Multiplier',
    explanation: 'Deep trouble (behind obstacles, impossible stances) — the worst possible dispersion.',
    formula: '\\sigma_{\\text{eff}} = \\sigma_{\\text{club}} \\times 1.60',
    context: '60% wider than fairway. Used for positions with no clean escape route.',
  },

  // Rollout
  rollout_fairway: {
    title: 'Fairway Rollout Fraction',
    explanation: 'Multiplier on rollout when the ball lands on fairway. Full rollout preserved.',
    formula: '\\text{total} = \\text{carry} + \\text{carry} \\times f_{\\text{roll}} \\times R_{\\text{surface}} \\times S_{\\text{slope}}',
    context: 'where R_fairway = 1.0 (full rollout), f_roll is the club\'s rollout fraction.',
  },
  rollout_rough: {
    title: 'Rough Rollout Fraction',
    explanation: 'Rough grass grabs the ball, drastically reducing rollout to ~15% of the fairway value.',
    formula: 'R_{\\text{rough}} = 0.15',
    context: 'Ball lands and stops quickly in thick grass.',
  },
  rollout_green: {
    title: 'Green Rollout Fraction',
    explanation: 'Green surface allows moderate rollout. Further damped by backspin from high-loft clubs.',
    formula: 'R_{\\text{green}} = 0.65 \\times \\underbrace{\\max(0.25,\\; 1 - (\\theta - 30) \\times 0.03)}_{\\text{backspin damping if } \\theta > 30°}',
    context: 'where theta is club loft. Wedges with loft > 30 degrees generate backspin that checks the ball.',
  },
  rollout_bunker: {
    title: 'Bunker Rollout Fraction',
    explanation: 'Sand kills all rollout — the ball plugs or stops immediately.',
    formula: 'R_{\\text{bunker}} = 0',
  },

  // Mode weights
  safe_variance_weight: {
    title: 'Safe Mode Variance Weight',
    explanation: 'In Safe mode, the objective function penalizes variance to avoid blow-up holes. The policy minimizes expected strokes plus a risk penalty.',
    formula: 'Q_{\\text{safe}}(s, a) = \\bar{Q}(s, a) + w_{\\text{var}} \\cdot \\sqrt{\\text{Var}[Q(s, a)]}',
    context: 'Higher values make safe mode more conservative. w_var = 1.0 adds one standard deviation of penalty.',
  },
  aggressive_green_bonus: {
    title: 'Aggressive Mode Green Bonus',
    explanation: 'In Aggressive mode, the objective rewards actions with higher probability of reaching the green, encouraging pin-attacking plays.',
    formula: 'Q_{\\text{agg}}(s, a) = \\bar{Q}(s, a) - \\beta \\cdot P_{\\text{green}}(s, a)',
    context: 'where beta is this bonus and P_green is the fraction of MC samples that land on the green surface.',
  },

  // Sampling
  samples_base: {
    title: 'Base MC Samples',
    explanation: 'Minimum Monte Carlo samples per (anchor, club, bearing) action in safe zones with no hazards nearby.',
    formula: 'N_{\\text{samples}} = \\begin{cases} 100 & \\text{no hazards} \\\\ 250 & \\text{bunker nearby} \\\\ 350 & \\text{OB/water nearby} \\end{cases}',
    context: 'More samples near hazards improve transition probability estimates for the DP solver.',
  },
  samples_hazard: {
    title: 'Hazard Zone Samples',
    explanation: 'MC samples when bunkers are in play. Higher count reduces noise in transition probabilities near penalty areas.',
    formula: 'N = 250 \\text{ (default)}',
  },
  samples_high_risk: {
    title: 'High Risk Zone Samples',
    explanation: 'MC samples when OB or water hazards are in play. Highest sample count ensures accurate penalty estimation.',
    formula: 'N = 350 \\text{ (default)}',
  },

  // Thresholds
  chip_range: {
    title: 'Chip Range',
    explanation: 'Within this distance to the pin, the DP solver treats the position as near-green and uses chip/putt value estimates instead of full club selection.',
    formula: 'V(s) = \\begin{cases} \\text{expectedPutts}(d) & \\text{if lie = green} \\\\ 1 + \\text{expectedPutts}(d \\cdot 0.15) & \\text{if lie = fairway} \\\\ 1 + \\text{expectedPutts}(d \\cdot 0.25) & \\text{if lie = rough} \\end{cases}',
    context: 'where d = distance to pin in yards. Default: 30 yards.',
  },
  short_game_threshold: {
    title: 'Short Game Threshold',
    explanation: 'Distance from pin below which the DP solver bypasses Nadaraya-Watson interpolation and uses direct short-game value formulas.',
    formula: 'd_{\\text{pin}} < 60 \\text{ yards} \\Rightarrow V = \\text{shortGameValue}(d, \\text{lie})',
    context: 'Prevents interpolation artifacts when near the green where anchor density may be low.',
  },
  green_radius: {
    title: 'Green Radius',
    explanation: 'Fallback radius when no green polygon is defined. A position within this distance of the pin is considered "on the green."',
    formula: '\\text{onGreen}(p) = \\begin{cases} \\text{true} & \\text{if } p \\in \\text{polygon}_{\\text{green}} \\\\ \\text{true} & \\text{if } d(p, \\text{pin}) \\leq r \\\\ \\text{false} & \\text{otherwise} \\end{cases}',
    context: 'where r = green_radius (default 10 yards). Also used for zone discretization termination.',
  },

  // Spatial
  zone_interval: {
    title: 'Zone Interval',
    explanation: 'Distance in yards between anchor positions along the hole centerline. Controls the granularity of the MDP state space.',
    formula: '\\text{anchors} = \\left\\lfloor \\frac{d_{\\text{tee→pin}}}{\\Delta z} \\right\\rfloor \\times 3 \\text{ positions}',
    context: 'where Delta_z = 20 yards. Each interval creates center, left, and right anchors. Smaller values = more anchors = more accurate but slower.',
  },
  lateral_offset: {
    title: 'Lateral Offset',
    explanation: 'Distance in yards that left/right anchor positions are placed from the centerline. Controls how wide the state space explores.',
    formula: '\\text{pos}_{\\text{left}} = \\text{project}(\\text{center},\\; \\theta - 90°,\\; \\delta)',
    context: 'where delta = 20 yards. Together with zone_interval, defines the anchor grid.',
  },
  bearing_range: {
    title: 'Bearing Range',
    explanation: 'The angular range (plus/minus degrees) of aim bearings explored from each anchor. Wider ranges explore more aim options.',
    formula: '\\theta_{\\text{aim}} \\in [\\theta_{\\text{pin}} - \\alpha,\\; \\theta_{\\text{pin}} + \\alpha]',
    context: 'where alpha = 30 degrees. Step size is adaptive: 4 deg for short holes, 2 deg for long holes.',
  },
  k_neighbors: {
    title: 'K Nearest Neighbors',
    explanation: 'Number of nearest anchor states used in Nadaraya-Watson kernel regression when a shot lands between anchors.',
    formula: '\\hat{V}(s, u) = \\frac{\\sum_{i=1}^{k} w_i \\cdot V(a_i)}{\\sum_{i=1}^{k} w_i}',
    context: 'where k = 6 neighbors, weighted by a Gaussian kernel in (s, u) space.',
  },
  kernel_h_s: {
    title: 'Kernel Bandwidth (s)',
    explanation: 'Bandwidth of the Gaussian kernel in the arc-distance (s) direction for value interpolation.',
    formula: 'w_i = \\exp\\!\\left(-\\frac{\\Delta s_i^2}{2 h_s^2} - \\frac{\\Delta u_i^2}{2 h_u^2}\\right)',
    context: 'where h_s = 25 yards. Controls how quickly influence decays along the hole direction.',
  },
  kernel_h_u: {
    title: 'Kernel Bandwidth (u)',
    explanation: 'Bandwidth of the Gaussian kernel in the lateral (u) direction for value interpolation.',
    formula: 'w_i = \\exp\\!\\left(-\\frac{\\Delta s_i^2}{2 h_s^2} - \\frac{\\Delta u_i^2}{2 h_u^2}\\right)',
    context: 'where h_u = 20 yards. Controls how quickly influence decays across the hole width.',
  },

  // Flight model
  tree_height_yards: {
    title: 'Tree Height',
    explanation: 'Assumed height of trees in yards (~45 feet). Used in trajectory collision detection — a shot must clear this height to fly over a tree hazard polygon.',
    formula: '\\text{clearance} = \\begin{cases} \\text{pass} & \\text{if apex} > h_{\\text{tree}} \\\\ \\text{blocked} & \\text{otherwise} \\end{cases}',
    context: 'where apex is the ball\'s peak height from the parabolic trajectory model.',
  },
  ball_apex_yards: {
    title: 'Ball Apex Height',
    explanation: 'Default peak height of a ball flight in yards (~84 feet). Used when per-club apex data is unavailable.',
    formula: 'y(x) = \\frac{4 h_{\\text{apex}}}{d_{\\text{carry}}} \\cdot x \\cdot \\left(1 - \\frac{x}{d_{\\text{carry}}}\\right)',
    context: 'Parabolic trajectory: y(x) peaks at h_apex at the midpoint x = d_carry/2.',
  },
  elev_yards_per_meter: {
    title: 'Elevation Factor',
    explanation: 'Yards of effective distance change per meter of elevation difference. Uphill plays longer, downhill plays shorter.',
    formula: 'd_{\\text{eff}} = d_{\\text{flat}} + \\Delta h_{\\text{meters}} \\times 1.09',
    context: 'Rule of thumb: ~1 yard per meter of elevation change.',
  },

  // Rollout model
  rollout_slope_factor: {
    title: 'Rollout Slope Factor',
    explanation: 'How much terrain slope affects rollout distance. Downhill slopes increase rollout, uphill slopes reduce it.',
    formula: 'S_{\\text{slope}} = \\text{clamp}\\!\\left(1 - m \\cdot \\kappa,\\; 0.5,\\; 1.5\\right)',
    context: 'where m is local slope (m/yd) and kappa = 3.0. Clamped to [0.5, 1.5] range.',
  },
  default_loft: {
    title: 'Default Loft',
    explanation: 'Fallback club loft in degrees when club-specific loft data is unavailable. Used for imputing rollout fraction.',
    formula: 'f_{\\text{roll}} = 0.12 \\cdot e^{-0.05 \\theta}',
    context: 'where theta = loft in degrees. Higher loft = less rollout. Used when measured total distance is unavailable.',
  },

  // Putting
  putt_coefficient: {
    title: 'Putt Log Coefficient',
    explanation: 'Coefficient in the logarithmic expected putts model, fitted to PGA strokes-gained data.',
    formula: 'E[\\text{putts}](d) = \\min\\!\\left(c,\\; 1.0 + \\alpha \\cdot \\ln(d)\\right)',
    context: 'where alpha = 0.42 and d = distance in yards. At 10 yards: E = 1.97 putts.',
  },
  putt_cap: {
    title: 'Putt Cap',
    explanation: 'Maximum expected putts regardless of distance. Prevents the log model from producing unrealistic values at extreme distances.',
    formula: 'E[\\text{putts}] \\leq c = 3',
    context: 'The log curve saturates at 3.0, which occurs around 120+ yards from the hole.',
  },

  // Simulation
  mc_trials: {
    title: 'Monte Carlo Trials',
    explanation: 'Number of random trials simulated per strategy to estimate score distributions and expected strokes after DP policy extraction.',
    formula: '\\bar{S} = \\frac{1}{N} \\sum_{i=1}^{N} S_i, \\quad N = 2000',
    context: 'Each trial follows the DP-optimal policy with Gaussian shot noise. More trials = more stable score distributions but slower.',
  },
  max_shots_per_hole: {
    title: 'Max Shots Per Hole',
    explanation: 'Safety limit on shots per MC trial to prevent infinite loops from hazard-drop cycles.',
    formula: 'S_i = \\min(\\text{shots}_i,\\; 8)',
    context: 'If a trial exceeds 8 shots, it terminates with the current score.',
  },

  // DP
  max_iterations: {
    title: 'Max Value Iterations',
    explanation: 'Maximum number of Bellman update sweeps in the value iteration solver. Usually converges in 10-15 iterations.',
    formula: 'V^{(k+1)}(s) = \\min_a \\left[ 1 + \\sum_{s\'} P(s\'|s,a) \\cdot V^{(k)}(s\') \\right]',
    context: 'Iteration stops when max|V^(k+1) - V^(k)| < threshold or k = 50.',
  },
  convergence_threshold: {
    title: 'Convergence Threshold',
    explanation: 'Value iteration terminates when the maximum change in any anchor value drops below this threshold.',
    formula: '\\max_s \\left| V^{(k+1)}(s) - V^{(k)}(s) \\right| < \\epsilon = 0.001',
    context: 'Smaller values give more precise solutions but take more iterations.',
  },

  // Club selection
  min_carry_ratio: {
    title: 'Min Carry Ratio',
    explanation: 'A club is only eligible if its mean carry is at least this fraction of the distance to the pin. Prevents using extremely short clubs.',
    formula: '\\text{eligible if } \\frac{\\bar{c}_{\\text{club}}}{d_{\\text{pin}}} \\geq 0.5',
    context: 'Default 0.5 means club carry must be at least 50% of remaining distance.',
  },
  max_carry_ratio: {
    title: 'Max Carry Ratio',
    explanation: 'A club is only eligible if its mean carry is at most this fraction of the distance to the pin. Prevents using clubs that fly past the green.',
    formula: '\\text{eligible if } \\frac{\\bar{c}_{\\text{club}}}{d_{\\text{pin}}} \\leq 1.10',
    context: 'Default 1.10 allows up to 10% overshoot to account for favorable roll.',
  },

  // Hazard
  hazard_drop_penalty: {
    title: 'Hazard Drop Penalty',
    explanation: 'Fractional stroke penalty added when resolving a hazard drop (in addition to the hazard\'s base penalty). Accounts for the positional disadvantage after a drop.',
    formula: 'S_{\\text{hazard}} = S_{\\text{base}} + p_{\\text{hazard}} + p_{\\text{drop}}',
    context: 'where p_drop = 0.3 strokes. Applied on top of the water/OB penalty (typically 1.0).',
  },
};

// ---------------------------------------------------------------------------
// Info Popover Component
// ---------------------------------------------------------------------------

function InfoPopover({ info, onClose }: { info: MathInfo; onClose: () => void }) {
  return (
    <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-sm border border-border bg-card shadow-lg p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <h5 className="text-xs font-semibold text-text-dark">{info.title}</h5>
        <button onClick={onClose} className="text-text-muted hover:text-text-dark flex-shrink-0">
          <X size={14} />
        </button>
      </div>
      <p className="text-[11px] text-text-medium leading-relaxed">{info.explanation}</p>
      {info.formula && (
        <div className="overflow-x-auto -mx-1 px-1 py-1 bg-surface rounded">
          <BlockMath math={info.formula} />
        </div>
      )}
      {info.context && (
        <p className="text-[10px] text-text-muted leading-relaxed italic">{info.context}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function StrategyConstantsEditor() {
  const { data: serverConstants, isLoading } = useSWR<ConstantRow[]>(CONSTANTS_KEY, fetcher);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [openInfo, setOpenInfo] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={20} className="animate-spin text-text-muted" />
      </div>
    );
  }

  const dbMap = new Map((serverConstants ?? []).map((r) => [r.key, r.value]));

  function getValue(key: string): number {
    if (key in edits) return edits[key];
    return dbMap.get(key) ?? 0;
  }

  function getOriginal(key: string): number {
    return dbMap.get(key) ?? 0;
  }

  function updateValue(key: string, value: number) {
    setEdits((prev) => ({ ...prev, [key]: value }));
  }

  function resetEdits() {
    setEdits({});
    setStatus(null);
  }

  const hasDirty = (serverConstants ?? []).some((c) => {
    const current = getValue(c.key);
    return current !== getOriginal(c.key);
  });

  // Group by category
  const grouped = new Map<string, ConstantRow[]>();
  for (const c of serverConstants ?? []) {
    const list = grouped.get(c.category) || [];
    list.push(c);
    grouped.set(c.category, list);
  }

  const sortedCategories = CATEGORY_ORDER.filter((cat) => grouped.has(cat));
  for (const cat of grouped.keys()) {
    if (!sortedCategories.includes(cat)) sortedCategories.push(cat);
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);

    const constants = (serverConstants ?? []).map((c) => ({
      key: c.key,
      value: getValue(c.key),
    }));

    try {
      const res = await fetch(CONSTANTS_KEY, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        credentials: 'include',
        body: JSON.stringify({ constants }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body);
      }

      await mutate(CONSTANTS_KEY);
      setEdits({});
      setStatus({ type: 'success', message: 'Constants updated — plans will regenerate' });
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-text-muted">
        Tune strategy optimizer parameters. Changes trigger plan regeneration for all courses.
      </p>

      {sortedCategories.map((category) => {
        const items = grouped.get(category) ?? [];
        return (
          <div key={category} className="flex flex-col gap-1.5">
            <h4 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider px-1">
              {CATEGORY_LABELS[category] ?? category}
            </h4>
            <div className="flex flex-col gap-1">
              {items.map((c) => {
                const current = getValue(c.key);
                const original = getOriginal(c.key);
                const isDirty = current !== original;
                const mathInfo = CONSTANT_MATH[c.key];

                return (
                  <div
                    key={c.key}
                    className="relative flex items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-text-dark font-medium">{c.key}</span>
                        {mathInfo && (
                          <button
                            onClick={() => setOpenInfo(openInfo === c.key ? null : c.key)}
                            className={`flex-shrink-0 rounded-full p-0.5 transition-colors ${
                              openInfo === c.key
                                ? 'text-primary bg-primary/10'
                                : 'text-text-faint hover:text-primary hover:bg-primary/5'
                            }`}
                            title="Show formula"
                          >
                            <Info size={12} />
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-text-muted leading-tight truncate">{c.description}</p>
                    </div>
                    <input
                      type="number"
                      step={c.value < 1 ? '0.01' : c.value < 10 ? '0.1' : '1'}
                      value={current}
                      onChange={(e) => updateValue(c.key, parseFloat(e.target.value) || 0)}
                      className={`w-20 rounded border bg-card px-1.5 py-1 text-sm text-center text-text-dark focus:border-primary focus:outline-none ${
                        isDirty ? 'border-primary' : 'border-border'
                      }`}
                    />
                    {openInfo === c.key && mathInfo && (
                      <InfoPopover info={mathInfo} onClose={() => setOpenInfo(null)} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving || !hasDirty} className="flex-1">
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save size={16} />
              Save All
            </>
          )}
        </Button>
        {hasDirty && (
          <Button onClick={resetEdits} variant="ghost" className="px-3">
            <RotateCcw size={16} />
          </Button>
        )}
      </div>

      {status && (
        <p className={`text-xs ${status.type === 'success' ? 'text-primary' : 'text-coral'}`}>
          {status.message}
        </p>
      )}
    </div>
  );
}
