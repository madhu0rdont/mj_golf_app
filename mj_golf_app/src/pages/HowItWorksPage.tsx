import type { ReactNode } from 'react';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';
import { TopBar } from '../components/layout/TopBar';

/* ── KaTeX helper ── */

function renderMath(text: string): ReactNode[] {
  const regex = /\$\$([\s\S]*?)\$\$|\$([^$]*?)\$/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  let lastWasBlock = false;

  while ((match = regex.exec(text)) !== null) {
    const isBlock = match[1] !== undefined;
    if (match.index > lastIndex) {
      let t = text.slice(lastIndex, match.index);
      if (lastWasBlock) t = t.replace(/^\n+/, '');
      if (isBlock) t = t.replace(/\n+$/, '');
      if (t) parts.push(<span key={key++}>{t}</span>);
    }
    if (isBlock) {
      parts.push(
        <div key={key++} className="overflow-x-auto -mx-1 px-1">
          <BlockMath math={match[1].trim()} />
        </div>,
      );
      lastWasBlock = true;
    } else {
      parts.push(<InlineMath key={key++} math={match[2]!} />);
      lastWasBlock = false;
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    let t = text.slice(lastIndex);
    if (lastWasBlock) t = t.replace(/^\n+/, '');
    if (t) parts.push(<span key={key++}>{t}</span>);
  }
  return parts;
}

/** Render a string with KaTeX into a <p> */
function P({ children, className = '' }: { children: string; className?: string }) {
  return (
    <p className={`text-sm text-text-medium leading-relaxed mb-3 whitespace-pre-line ${className}`}>
      {renderMath(children)}
    </p>
  );
}

function H3({ children }: { children: string }) {
  return <h3 className="text-sm font-medium text-text-medium uppercase mb-3">{children}</h3>;
}

function H4({ children }: { children: string }) {
  return <h4 className="text-sm font-semibold text-text-dark mt-5 mb-2">{children}</h4>;
}

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-border bg-card p-4 mb-4">{children}</div>;
}

function DiagramCaption({ children }: { children: string }) {
  return <p className="text-[11px] text-text-muted text-center mt-1 mb-3">{children}</p>;
}

/* ── SVG Diagrams ── */

const C = {
  primary: '#2D6A4F',
  primaryLight: '#40916C',
  gold: '#D4A843',
  coral: '#E76F51',
  blue: '#4361EE',
  purple: '#7209B7',
  orange: '#F4A261',
  muted: '#9B9B9B',
  faint: '#C5C5C5',
  bg: '#F3F0EB',
  card: '#FFFFFF',
};

function BlockedVsInterleavedDiagram() {
  const clubs = [C.blue, C.blue, C.blue, C.blue, C.orange, C.orange, C.orange, C.orange, C.purple, C.purple, C.purple, C.purple];
  const interleaved = [C.blue, C.orange, C.purple, C.blue, C.purple, C.orange, C.blue, C.orange, C.purple, C.orange, C.blue, C.purple];
  const r = 8;
  const gap = 26;
  const x0 = 80;
  const w = x0 + clubs.length * gap + 10;

  return (
    <svg viewBox={`0 0 ${w} 90`} className="w-full" style={{ maxHeight: 90 }}>
      {/* Labels */}
      <text x={8} y={28} fontSize="11" fill={C.muted} fontFamily="system-ui" fontWeight="500">Blocked</text>
      <text x={8} y={68} fontSize="11" fill={C.muted} fontFamily="system-ui" fontWeight="500">Random</text>
      {/* Blocked row */}
      {clubs.map((c, i) => (
        <circle key={`b-${i}`} cx={x0 + i * gap} cy={24} r={r} fill={c} fillOpacity={0.8} />
      ))}
      {/* Interleaved row */}
      {interleaved.map((c, i) => (
        <circle key={`r-${i}`} cx={x0 + i * gap} cy={64} r={r} fill={c} fillOpacity={0.8} />
      ))}
    </svg>
  );
}

function RetentionCrossoverDiagram() {
  // Blocked: starts high, drops at retention
  // Random: starts lower, rises at retention
  const w = 300;
  const h = 120;
  const ml = 45;
  const mr = 15;
  const mt = 15;
  const mb = 30;
  const pw = w - ml - mr;
  const ph = h - mt - mb;

  const blockedPts = [[0, 0.3], [0.5, 0.2], [1, 0.55]];
  const randomPts = [[0, 0.6], [0.5, 0.5], [1, 0.25]];

  const toX = (t: number) => ml + t * pw;
  const toY = (v: number) => mt + v * ph;

  const toPath = (pts: number[][]) =>
    `M ${pts.map(([t, v]) => `${toX(t)},${toY(v)}`).join(' L ')}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 120 }}>
      {/* Axes */}
      <line x1={ml} y1={mt} x2={ml} y2={h - mb} stroke={C.faint} strokeWidth="1" />
      <line x1={ml} y1={h - mb} x2={w - mr} y2={h - mb} stroke={C.faint} strokeWidth="1" />
      {/* Y label */}
      <text x={8} y={mt + ph / 2} fontSize="9" fill={C.muted} fontFamily="system-ui" textAnchor="middle" transform={`rotate(-90, 8, ${mt + ph / 2})`}>
        Error
      </text>
      {/* X labels */}
      <text x={toX(0)} y={h - mb + 16} fontSize="9" fill={C.muted} fontFamily="system-ui" textAnchor="middle">Practice</text>
      <text x={toX(1)} y={h - mb + 16} fontSize="9" fill={C.muted} fontFamily="system-ui" textAnchor="middle">1 Week Later</text>
      {/* Dashed separator */}
      <line x1={toX(0.5)} y1={mt} x2={toX(0.5)} y2={h - mb} stroke={C.faint} strokeWidth="0.5" strokeDasharray="3 3" />
      {/* Blocked line */}
      <polyline points={toPath(blockedPts).replace('M ', '')} fill="none" stroke={C.coral} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Random line */}
      <polyline points={toPath(randomPts).replace('M ', '')} fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Legend */}
      <line x1={ml + 8} y1={mt + 4} x2={ml + 22} y2={mt + 4} stroke={C.coral} strokeWidth="2" />
      <text x={ml + 26} y={mt + 7} fontSize="9" fill={C.coral} fontFamily="system-ui">Blocked</text>
      <line x1={ml + 80} y1={mt + 4} x2={ml + 94} y2={mt + 4} stroke={C.primary} strokeWidth="2" />
      <text x={ml + 98} y={mt + 7} fontSize="9" fill={C.primary} fontFamily="system-ui">Random</text>
    </svg>
  );
}

function DecayWeightsDiagram() {
  const w = 300;
  const h = 130;
  const ml = 40;
  const mr = 15;
  const mt = 15;
  const mb = 30;
  const pw = w - ml - mr;
  const ph = h - mt - mb;

  const toX = (d: number) => ml + (d / 90) * pw;
  const toY = (wt: number) => mt + (1 - wt) * ph;

  // Decay curve points
  const curve: [number, number][] = [];
  for (let d = 0; d <= 90; d += 2) {
    curve.push([d, Math.pow(0.5, d / 30)]);
  }

  // Session dots
  const sessions = [
    { days: 2, label: '' },
    { days: 12, label: '' },
    { days: 30, label: '0.50' },
    { days: 55, label: '' },
    { days: 75, label: '' },
  ];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 130 }}>
      {/* Axes */}
      <line x1={ml} y1={mt} x2={ml} y2={h - mb} stroke={C.faint} strokeWidth="1" />
      <line x1={ml} y1={h - mb} x2={w - mr} y2={h - mb} stroke={C.faint} strokeWidth="1" />
      {/* Y ticks */}
      {[1.0, 0.5, 0.25].map((v) => (
        <g key={v}>
          <line x1={ml - 3} y1={toY(v)} x2={ml} y2={toY(v)} stroke={C.faint} strokeWidth="1" />
          <text x={ml - 6} y={toY(v) + 3} fontSize="8" fill={C.muted} fontFamily="system-ui" textAnchor="end">{v}</text>
          <line x1={ml} y1={toY(v)} x2={w - mr} y2={toY(v)} stroke={C.faint} strokeWidth="0.3" strokeDasharray="2 3" />
        </g>
      ))}
      {/* X ticks */}
      {[0, 30, 60, 90].map((d) => (
        <g key={d}>
          <line x1={toX(d)} y1={h - mb} x2={toX(d)} y2={h - mb + 3} stroke={C.faint} strokeWidth="1" />
          <text x={toX(d)} y={h - mb + 14} fontSize="8" fill={C.muted} fontFamily="system-ui" textAnchor="middle">{d}d</text>
        </g>
      ))}
      {/* Y label */}
      <text x={6} y={mt + ph / 2} fontSize="9" fill={C.muted} fontFamily="system-ui" textAnchor="middle" transform={`rotate(-90, 6, ${mt + ph / 2})`}>
        Weight
      </text>
      {/* X label */}
      <text x={ml + pw / 2} y={h - 2} fontSize="9" fill={C.muted} fontFamily="system-ui" textAnchor="middle">Days ago</text>
      {/* Curve */}
      <polyline
        points={curve.map(([d, wt]) => `${toX(d)},${toY(wt)}`).join(' ')}
        fill="none"
        stroke={C.primary}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Session dots */}
      {sessions.map(({ days }) => {
        const wt = Math.pow(0.5, days / 30);
        return (
          <circle key={days} cx={toX(days)} cy={toY(wt)} r={4} fill={C.gold} stroke={C.card} strokeWidth="1.5" />
        );
      })}
    </svg>
  );
}

function SimulationFlowDiagram() {
  const w = 320;
  const h = 110;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 110 }}>
      {/* Fairway bg */}
      <rect x={10} y={15} width={300} height={70} rx={8} fill="#1B4332" />
      {/* Tee */}
      <circle cx={35} cy={50} r={5} fill={C.card} />
      <text x={35} y={98} fontSize="8" fill={C.muted} fontFamily="system-ui" textAnchor="middle">250 yds</text>
      {/* Shot 1 fan */}
      {[-18, -10, -3, 4, 12, 20].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const len = 100 + (i % 3) * 15;
        const ex = 35 + Math.cos(rad) * len;
        const ey = 50 - Math.sin(rad) * len;
        return <line key={`s1-${i}`} x1={35} y1={50} x2={ex} y2={ey} stroke={C.primaryLight} strokeWidth="0.7" strokeOpacity="0.5" strokeDasharray="2 2" />;
      })}
      {/* Landing cluster 1 */}
      {[[-2, 3], [4, -5], [-1, -2], [6, 1], [2, 6], [-4, -1]].map(([dx, dy], i) => (
        <circle key={`d1-${i}`} cx={155 + dx} cy={50 + dy} r={2} fill={C.gold} fillOpacity={0.7} />
      ))}
      {/* Shot 2 fan */}
      {[-15, -5, 5, 15].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const len = 80 + (i % 2) * 12;
        const ex = 155 + Math.cos(rad) * len;
        const ey = 50 - Math.sin(rad) * len;
        return <line key={`s2-${i}`} x1={155} y1={50} x2={ex} y2={ey} stroke={C.gold} strokeWidth="0.7" strokeOpacity="0.4" strokeDasharray="2 2" />;
      })}
      {/* Pin flag */}
      <line x1={280} y1={25} x2={280} y2={60} stroke={C.card} strokeWidth="1.5" />
      <polygon points="280,25 295,31 280,37" fill={C.coral} />
      <circle cx={280} cy={60} r={3} fill={C.card} fillOpacity={0.5} />
      {/* Landing cluster 2 */}
      {[[0, 2], [3, -3], [-2, 1], [4, -1], [-1, -4], [1, 3]].map(([dx, dy], i) => (
        <circle key={`d2-${i}`} cx={270 + dx} cy={50 + dy} r={2} fill={C.coral} fillOpacity={0.6} />
      ))}
      {/* Label */}
      <text x={160} y={10} fontSize="9" fill={C.muted} fontFamily="system-ui" textAnchor="middle" fontWeight="500">
        ×2,000 trials per strategy
      </text>
    </svg>
  );
}

function PuttingCurveDiagram() {
  const w = 300;
  const h = 130;
  const ml = 45;
  const mr = 15;
  const mt = 15;
  const mb = 30;
  const pw = w - ml - mr;
  const ph = h - mt - mb;

  const xMax = 22;
  const yMin = 0.8;
  const yMax = 2.5;

  const toX = (d: number) => ml + (d / xMax) * pw;
  const toY = (p: number) => mt + ((yMax - p) / (yMax - yMin)) * ph;

  const expectedPutts = (d: number) => d <= 1 ? 1.0 : Math.min(3, 1.0 + 0.42 * Math.log(d));

  const curve: [number, number][] = [];
  for (let d = 1; d <= 20; d += 0.5) {
    curve.push([d, expectedPutts(d)]);
  }

  const labels = [
    { d: 3, p: expectedPutts(3), text: '1.5' },
    { d: 10, p: expectedPutts(10), text: '2.0' },
    { d: 20, p: expectedPutts(20), text: '2.3' },
  ];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 130 }}>
      {/* Axes */}
      <line x1={ml} y1={mt} x2={ml} y2={h - mb} stroke={C.faint} strokeWidth="1" />
      <line x1={ml} y1={h - mb} x2={w - mr} y2={h - mb} stroke={C.faint} strokeWidth="1" />
      {/* Y ticks */}
      {[1.0, 1.5, 2.0, 2.5].map((v) => (
        <g key={v}>
          <line x1={ml - 3} y1={toY(v)} x2={ml} y2={toY(v)} stroke={C.faint} strokeWidth="1" />
          <text x={ml - 6} y={toY(v) + 3} fontSize="8" fill={C.muted} fontFamily="system-ui" textAnchor="end">{v.toFixed(1)}</text>
          <line x1={ml} y1={toY(v)} x2={w - mr} y2={toY(v)} stroke={C.faint} strokeWidth="0.3" strokeDasharray="2 3" />
        </g>
      ))}
      {/* X ticks */}
      {[5, 10, 15, 20].map((d) => (
        <g key={d}>
          <line x1={toX(d)} y1={h - mb} x2={toX(d)} y2={h - mb + 3} stroke={C.faint} strokeWidth="1" />
          <text x={toX(d)} y={h - mb + 14} fontSize="8" fill={C.muted} fontFamily="system-ui" textAnchor="middle">{d}</text>
        </g>
      ))}
      {/* Labels */}
      <text x={6} y={mt + ph / 2} fontSize="9" fill={C.muted} fontFamily="system-ui" textAnchor="middle" transform={`rotate(-90, 6, ${mt + ph / 2})`}>
        Expected Putts
      </text>
      <text x={ml + pw / 2} y={h - 2} fontSize="9" fill={C.muted} fontFamily="system-ui" textAnchor="middle">Distance to pin (yds)</text>
      {/* Curve */}
      <polyline
        points={curve.map(([d, p]) => `${toX(d)},${toY(p)}`).join(' ')}
        fill="none"
        stroke={C.primary}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Labeled points */}
      {labels.map(({ d, p, text }) => (
        <g key={d}>
          <circle cx={toX(d)} cy={toY(p)} r={3.5} fill={C.gold} stroke={C.card} strokeWidth="1.5" />
          <text x={toX(d) + 6} y={toY(p) - 6} fontSize="9" fill={C.gold} fontFamily="system-ui" fontWeight="600">{text}</text>
        </g>
      ))}
    </svg>
  );
}

/* ── Page ── */

export function HowItWorksPage() {
  return (
    <>
      <TopBar title="How It Works" showBack />
      <div className="px-4 py-4">

        {/* ── Section 1: Why Interleaved Practice? ── */}
        <Card>
          <H3>Why Interleaved Practice?</H3>

          <H4>The problem with blocked practice</H4>
          <P>{`Hitting the same club 20 times in a row feels productive — you groove a rhythm and your shots tighten up within the session. But research consistently shows this doesn't stick. A week later, those gains have faded.`}</P>
          <P>{`The reason is how motor memory works. When you repeat the same shot, the motor plan stays in working memory and never gets deeply encoded. Switch clubs on every shot and your brain is forced to rebuild the plan from scratch each time — a harder process that creates stronger, more durable memory traces.`}</P>
          <P>{`This is called the contextual interference effect: more interference during practice leads to worse in-session performance but significantly better long-term retention.`}</P>

          <BlockedVsInterleavedDiagram />
          <DiagramCaption>Blocked practice repeats the same club. Interleaved mixes them randomly.</DiagramCaption>

          <H4>What the golf research shows</H4>
          <P>{`Three golf-specific studies tell the story:`}</P>
          <P>{`Fazeli et al. (2017) — 30 novice golfers practiced putting for 6 consecutive days. The blocked group putted better during practice, but at a 1-week retention test the random group was more accurate and had developed mental representations closer to those of skilled golfers.`}</P>
          <P>{`Mousavi et al. (2024) — 40 golfers practiced putting over 3 days. On a retention test 72 hours later, the random group averaged 34.7 cm from the hole vs. 45.9 cm for the blocked group — a 24% accuracy advantage.`}</P>
          <P>{`Porter & Beckerman (2016) — Studied golf chipping with three shot variations. During practice, both groups improved equally. On a random-order retention test, the interleaved group was significantly more accurate. The blocked practice gains didn't transfer.`}</P>

          <RetentionCrossoverDiagram />
          <DiagramCaption>The classic crossover: blocked looks better during practice, but interleaved wins at retention.</DiagramCaption>

          <H4>Who should use it</H4>
          <P>{`If you're a complete beginner who can't make consistent contact yet, start with short blocks (5–10 shots of the same club) to build a basic feel, then progressively shorten the blocks until you're fully interleaved.`}</P>
          <P>{`This app's interleaved mode is designed for golfers who already have baseline club data from practice sessions — it randomly assigns distances and uses your real shot data to recommend strategies.`}</P>
        </Card>

        {/* ── Section 2: Yardage Book ── */}
        <Card>
          <H3>Yardage Book</H3>

          <H4>Recency-weighted averages</H4>
          <P>{String.raw`Each club's "book carry" is a recency-weighted average across all practice sessions. Each session's average carry gets a weight based on how old it is:

$$w(t) = 0.5^{\,t/30}$$

where $t$ is the age in days and 30 is the half-life. A session from today has weight 1.0, 30 days ago has weight 0.5, 60 days has 0.25. The book carry is then:

$$\text{bookCarry} = \frac{\sum(\text{carry}_i \cdot w_i)}{\sum w_i}$$

Recent sessions dominate, but older data still contributes — one bad day on the range won't blow up your numbers.`}</P>

          <DecayWeightsDiagram />
          <DiagramCaption>Session weights decay with a 30-day half-life. Recent sessions (gold dots) contribute most.</DiagramCaption>

          <H4>Freshness badges</H4>
          <P>{`Each club has a freshness badge based on how recently you've hit it on the monitor:

  Fresh — last session < 14 days ago
  Aging — 14 to 45 days ago
  Stale — > 45 days ago

Stale clubs still have valid book numbers, but the weights will be small. The home page warns you when clubs are stale so you know which ones to prioritize at the range.`}</P>

          <H4>Filling gaps with imputation</H4>
          <P>{String.raw`For clubs with a known carry and loft but no shot data, the app scales Trackman PGA Tour reference data to your level. It computes a scaling factor $s = \text{yourCarry} / \text{tourCarry}$, then scales speed-dependent metrics (ball speed, apex height) by $s$. Loft-driven metrics like launch angle come directly from tour data.

Rollout is estimated as:

$$\text{total} = \text{carry} \cdot \left(1 + 0.12 \cdot e^{-0.05 \cdot \text{loft}}\right)$$

For clubs with no carry data at all, the app uses piecewise linear interpolation between your other clubs' known data, using loft as the independent variable.

Imputed clubs also get dispersion estimates for the Monte Carlo simulation. Carry spread ($\sigma_\text{carry}$), offline spread ($\sigma_\text{offline}$), and mean offline bias ($\mu_\text{offline}$) are each extrapolated via linear regression from your real clubs' data. This means if your right miss gets worse with longer clubs, imputed long clubs inherit that rightward trend rather than being centered at zero.`}</P>

          <H4>Tour reference data</H4>
          <P>{`The imputation engine uses 14 reference points from Trackman PGA Tour averages, covering every loft from driver (10.5°) to lob wedge (60°). These serve as a "shape template" — the relationships between metrics at each loft are well-established by physics. Scaling by your carry-to-tour ratio captures your swing speed implicitly without needing to measure it directly.`}</P>
        </Card>

        {/* ── Section 3: Smart Club Selection ── */}
        <Card>
          <H3>Smart Club Selection</H3>

          <H4>How the simulation works</H4>
          <P>{String.raw`For each shot during interleaved practice, the app builds a statistical profile for every club from your real shot data — the mean and standard deviation of carry distance ($\mu_\text{carry}, \sigma_\text{carry}$) and lateral miss ($\mu_\text{offline}, \sigma_\text{offline}$).

It then enumerates candidate club sequences based on the hole distance:

  ≤ 225 yds → 1-club plans
  226–425 yds → 2-club plans
  > 425 yds → 2-club + 3-club plans

For each candidate, the simulator runs 2,000 independent trials. Each shot is sampled from the club's distribution, the remaining distance is recalculated, and the process repeats until the ball reaches the green. The top 3 strategies by expected score are shown.`}</P>

          <SimulationFlowDiagram />
          <DiagramCaption>Each strategy is simulated 2,000 times with random carry and offline from your real shot data.</DiagramCaption>

          <H4>Remaining distance</H4>
          <P>{String.raw`After every shot, the app re-aims at the hole and recalculates true distance using the Pythagorean theorem:

$$\text{remaining}' = \sqrt{(\text{remaining} - \text{carry})^2 + \text{offline}^2}$$

Lateral misses cost real distance. If you're 50 yards out, carry 40, but miss 10 yards right, you're not 10 yards away — you're $\sqrt{10^2 + 10^2} \approx 14$ yards away.

Example — Par 4, 300 yards:
  Shot 1: Mini Driver, 251 carry, 25R → $\sqrt{49^2 + 25^2} \approx 55$ yds left
  Shot 2: 58°, 50 carry, 5R → $\sqrt{5^2 + 5^2} \approx 7$ yds left — on the green

After each shot, the app reorients toward the hole. Offline misses don't accumulate — each shot gets a fresh aim at the pin.`}</P>

          <H4>Proximity putting</H4>
          <P>{String.raw`Instead of a flat 2 putts, the simulation estimates putts based on how close you finish to the pin, using a log-curve fitted to PGA strokes-gained data:

$$\text{putts}(d) = 1.0 + 0.42 \cdot \ln(d)$$

This means landing 3 yards from the pin averages ~1.5 putts, while 10 yards out averages ~2.0. The model rewards strategies that consistently land close to the pin — two strategies might both reach the green in 2 shots, but if one averages 4 yards out and the other 9, the first scores ~0.3 strokes better per hole.`}</P>

          <PuttingCurveDiagram />
          <DiagramCaption>Expected putts increase logarithmically with distance from the pin.</DiagramCaption>

          <H4>Why 2,000 trials?</H4>
          <P>{String.raw`With 2,000 trials, the standard error of the mean score is about $\frac{1.0}{\sqrt{2000}} \approx 0.02$ strokes — accurate enough to reliably distinguish a 3.5 vs 3.7 stroke strategy. For par 5s with many candidates, trials scale down to a minimum of 500 to keep computation bounded.`}</P>

          <H4>When does it run?</H4>
          <P>{`The Monte Carlo strategy card appears on every shot where the remaining distance is greater than your longest wedge carry. After each shot, it re-runs with the new remaining distance.

Once you're within wedge range, a simple greedy recommendation takes over — it picks the club whose carry is closest to the remaining distance, including grip-down options.`}</P>

          <H4>Scoring zone</H4>
          <P>{String.raw`The scoring zone measures how efficiently you get the ball within 100 yards of the pin. On a par 4, you should reach 100 yards in $\text{par} - 2 = 2$ strokes. If it takes 3, your delta is +1. A negative delta means your long game is outperforming expectations.`}</P>
        </Card>
      </div>
    </>
  );
}
