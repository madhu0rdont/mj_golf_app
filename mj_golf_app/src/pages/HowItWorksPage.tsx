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

function Card({ children, id }: { children: ReactNode; id?: string }) {
  return <div id={id} className="rounded-xl border border-border bg-card p-4 mb-4 scroll-mt-14">{children}</div>;
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

const SECTIONS = [
  { id: 'interleaved', label: 'Interleaved' },
  { id: 'yardage-book', label: 'Yardage Book' },
  { id: 'club-selection', label: 'Club Selection' },
  { id: 'course-mgmt', label: 'Course Mgmt' },
];

export function HowItWorksPage() {
  return (
    <>
      <TopBar title="How It Works" showBack />

      {/* Sticky section nav */}
      <div className="sticky top-14 z-10 bg-surface/95 backdrop-blur-sm border-b border-border px-4 py-2">
        <div className="flex gap-1.5 overflow-x-auto">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="flex-shrink-0 rounded-full bg-surface px-3 py-1 text-xs font-medium text-text-medium hover:bg-border hover:text-text-dark transition-colors"
            >
              {s.label}
            </a>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">

        {/* ── Section 1: Why Interleaved Practice? ── */}
        <Card id="interleaved">
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
        <Card id="yardage-book">
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
        <Card id="club-selection">
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

        {/* ── Section 4: Course Management ── */}
        <Card id="course-mgmt">
          <H3>Course Management</H3>

          <H4>Importing a course</H4>
          <P>{`Courses are imported from KML files via the Admin page. The KML contains GPS coordinates for every tee, pin, target, and center line on each hole. Once imported, each hole gets computed yardages, elevation deltas, compass heading, and plays-like yardages based on elevation difference between tee and green.`}</P>

          <H4>Hazard mapping</H4>
          <P>{`Each hole can have hazards drawn as GPS polygons on a satellite map — fairway bunkers, greenside bunkers, water, out-of-bounds, trees, and rough. Each hazard type has a default stroke penalty applied when a simulated shot lands inside the polygon:`}</P>
          <P>{`  Water / OB — 1.0 stroke
  Greenside bunker — 0.5 stroke
  Trees — 0.5 stroke
  Fairway bunker — 0.3 stroke
  Rough — 0.2 stroke`}</P>
          <P>{`Penalties are configurable from the Admin page. The green is also drawn as a polygon and used to compute the center-green aim point for par 3 strategies.`}</P>

          <H4>Strategy optimizer — Dynamic Programming (MDP)</H4>
          <P>{String.raw`Rather than using hardcoded strategy templates, the optimizer models each hole as a Markov Decision Process (MDP) and solves it with Dynamic Programming. This means it explores every reachable position on the hole, every eligible club you could hit from that position, and every aim direction you might choose — then finds the sequence of decisions that minimizes your expected score.

The key advantage: the optimizer discovers strategies on its own. It doesn't need to be told "hit driver, then 7-iron." It figures out that a 3-wood off the tee followed by a gap wedge scores better than driver-plus-9-iron because the 3-wood avoids the fairway bunker at 260 yards. It also produces conditional strategies — if your tee shot ends up in the rough right instead of the fairway, it already knows the best play from there.

All computation runs server-side (~4–5 seconds per hole, ~80 seconds for 18 holes). The client fetches results via API.`}</P>

          <H4>Step 1: Zone discretization</H4>
          <P>{String.raw`The optimizer breaks each hole into a grid of discrete zones. Starting from the tee, it walks along the hole's center line in 20-yard intervals. At each interval, it creates 3 lateral positions: center (on the center line), left (20 yards left), and right (20 yards right). Each zone records its GPS position, its distance to the pin, and its lie — fairway or rough — determined by checking whether the position falls inside any fairway polygon.

The tee is zone 0. The green is a terminal zone: once the ball reaches within 10 yards of the pin, the hole is over and only putting remains. A typical hole has ~50 zones.

$$\text{zones} = \{\text{tee}\} \cup \bigcup_{d=20,40,\ldots}^{d_\text{pin}-10} \{\text{center}_d, \text{left}_d, \text{right}_d\} \cup \{\text{green}\}$$

The green zone's value is set to expected putts from 0 yards — the terminal condition for value iteration.`}</P>

          <H4>Step 2: Action space</H4>
          <P>{String.raw`From each non-terminal zone, the optimizer enumerates every possible action: a (club, aim bearing) pair.

Eligible clubs are those whose mean carry falls between 50% and 120% of the remaining distance to the pin. This keeps the search space practical — you wouldn't hit driver from 80 yards, and you wouldn't hit a wedge from 280. Typically 5–7 clubs qualify per zone.

Aim bearings are sampled at 5° increments across $\pm$30° from the direct bearing to the pin — 13 bearings total. This lets the optimizer discover strategies like "aim 20° left to avoid water and let your draw bring it back."

$$\text{actions}(z) = \{(c, \theta) : c \in \text{eligible}(z),\; \theta \in \{\theta_\text{pin} - 30°, \ldots, \theta_\text{pin} + 30°\}\}$$

Total: ~70–90 actions per zone, explored exhaustively.`}</P>

          <H4>Step 3: Transition sampling</H4>
          <P>{String.raw`For each (zone, club, bearing) triple, the optimizer simulates 200 Gaussian shots to build a probability distribution over where the ball will end up.

Each sample draws carry and offline from your measured club distributions:

$$\text{carry} \sim \mathcal{N}(\mu_\text{carry},\; \sigma_\text{carry} \cdot \lambda)$$
$$\text{offline} \sim \mathcal{N}(\mu_\text{offline},\; \sigma_\text{offline} \cdot \lambda)$$

where $\lambda$ is a lie multiplier: $\lambda = 1.0$ from the fairway, $\lambda = 1.15$ from the rough (15% wider dispersion due to uncertain contact).

Each sample is projected to a GPS landing point, checked for tree trajectory collisions (3D flight model vs. canopy polygons), checked for hazard polygon hits (with stroke penalties), and then mapped to the nearest zone. After all 200 samples, the result is a transition probability table:

$$P(z' \mid z, a) = \frac{\text{count of samples landing in zone } z'}{200}$$

Along with the expected penalty $\mathbb{E}[\text{penalty} \mid z, a]$, penalty variance $\text{Var}[\text{penalty} \mid z, a]$, and the probability of reaching the green in one shot $P(\text{green} \mid z, a)$.

This transition table is the most expensive step (~800K samples per hole) but is built once and shared across all 3 scoring modes.`}</P>

          <H4>Step 4: Value iteration (Bellman equation)</H4>
          <P>{String.raw`With the transition table built, the optimizer solves for the optimal value (expected strokes to finish) at every zone using the Bellman equation. It does this 3 times with different objective functions, producing 3 strategies per hole:

Scoring mode — pure expected strokes minimization:
$$V(z) = \min_a \left[ 1 + \mathbb{E}[\text{penalty} \mid z,a] + \sum_{z'} P(z' \mid z,a) \cdot V(z') \right]$$

Safe mode — risk-adjusted, penalizes variance:
$$V(z) = \min_a \left[ 1 + \mathbb{E}[\text{penalty} \mid z,a] + \sum_{z'} P(z' \mid z,a) \cdot V(z') + 0.5 \cdot \sigma_\text{penalty} \right]$$

Aggressive mode — rewards reaching the green (birdie hunting):
$$V(z) = \min_a \left[ 1 + \mathbb{E}[\text{penalty} \mid z,a] + \sum_{z'} P(z' \mid z,a) \cdot V(z') - 0.3 \cdot P(\text{green} \mid z,a) \right]$$

The $+0.5\sigma$ term in Safe mode means it prefers lower-variance plays even if they cost a fraction of a stroke on average. The $-0.3 \cdot P(\text{green})$ term in Aggressive mode gives a bonus for actions that can reach the green — encouraging go-for-it plays on par 5s and drivable par 4s.

Value iteration starts with $V(z) = \infty$ for all non-terminal zones and $V(\text{green}) = \text{expectedPutts}(0)$. Each iteration updates every zone's value using the Bellman equation above. Convergence is reached when the maximum value change across all zones drops below 0.001, or after 50 iterations (whichever comes first). Typically converges in ~10 iterations.

The optimal policy $\pi^*(z)$ at each zone is the action that achieves the minimum value:
$$\pi^*(z) = \arg\min_a \left[ \text{objective}(z, a) \right]$$`}</P>

          <H4>Step 5: Policy extraction and Monte Carlo scoring</H4>
          <P>{String.raw`Once value iteration converges, the optimizer traces the optimal path from the tee zone by following each mode's policy:

$$z_0 = \text{tee}, \quad z_{k+1} = \text{most likely zone from } P(z' \mid z_k, \pi^*(z_k))$$

This gives the planned club sequence and aim points. But to get accurate score distributions, the optimizer runs 2,000 Monte Carlo trials that follow the policy with conditional zone lookup — the critical advantage over template-based simulation.

In each trial:
  1. Start at the tee zone
  2. Look up the policy's action for the current zone: $a = \pi^*(z_\text{current})$
  3. Sample a random shot from the club's distribution (carry + offline)
  4. Check tree collisions and hazards at the landing point
  5. Find the nearest zone to the landing point
  6. Repeat from step 2 at the new zone
  7. Once on the green, add expected putts

The key difference from the old system: if the ball lands in an unexpected zone (rough right instead of fairway center), the policy already has an optimal action for that zone. The old template system would blindly hit the same second club regardless of where the tee shot ended up. This produces realistic score distributions that account for recovery shots.

After 2,000 trials, the standard error of the expected score is:
$$\text{SE} = \frac{\sigma}{\sqrt{2000}} \approx 0.02 \text{ strokes}$$`}</P>

          <H4>Lateral bias compensation</H4>
          <P>{String.raw`Most golfers have a consistent lateral miss pattern — a draw bias, a fade, or a push. The optimizer compensates for this by shifting aim points opposite to your measured mean offline.

If your driver averages 8 yards right of target ($\mu_\text{offline} = 8$), the optimizer shifts your aim point 8 yards left so that the expected landing zone is centered on the target. The shift is applied perpendicular to the shot bearing:

$$\text{aimPoint} = \text{project}(\text{target}, \text{bearing} + 90°, -\mu_\text{offline})$$

On the map, you see two lines per shot: the white dashed aim line (where to point the club) and the cyan ball flight curve (expected ball path with draw/fade shape). The dispersion ellipses on the map are centered on the landing target (where the ball actually goes), not the aim point.`}</P>

          <H4>Tree trajectory collision</H4>
          <P>{String.raw`During both transition sampling and Monte Carlo trials, each shot's flight arc is checked against tree hazard polygons. The ball's height is sampled at 10-yard intervals along the flight path and compared against the tree canopy height (15 yards). If the ball is below the canopy and inside a tree polygon, it drops at the collision point with a 0.5-stroke penalty.

Ball height uses an asymmetric two-segment flight model when per-club data is available:

Ascent phase ($d < d_\text{apex}$):
$$h(d) = \text{apex} \cdot t \cdot (2 - t), \quad t = \frac{d}{d_\text{apex}}$$

Descent phase ($d \geq d_\text{apex}$):
$$h(d) = \text{apex} \cdot \frac{\text{carry} - d}{\text{carry} - d_\text{apex}}$$

where the apex position is forward-shifted to match real ball flight:
$$d_\text{apex} = \max\!\left(0.3 \cdot \text{carry},\; \text{carry} - \frac{\text{apex}}{\tan(\theta_\text{descent})}\right)$$

If the club has no measured apex or descent angle, it falls back to a symmetric parabola with a 28-yard (84 ft) apex:
$$h(d) = 4 \cdot 28 \cdot \frac{d}{\text{carry}} \cdot \left(1 - \frac{d}{\text{carry}}\right)$$`}</P>

          <H4>Putting model</H4>
          <P>{String.raw`Once on the green (within 10 yards of the pin), the same log-curve putting model from the Club Selection section converts distance to expected putts:

$$\text{putts}(d) = 1.0 + 0.42 \cdot \ln(d)$$

If the ball is 10–40 yards out (chip zone), the trial adds 1 chip stroke plus expected putts from 3 yards ($\approx$ 1.46 putts total). This model is used both as the terminal value in value iteration and in the Monte Carlo scoring trials.`}</P>

          <H4>Score distribution</H4>
          <P>{String.raw`Each of the 2,000 Monte Carlo trials produces a total stroke count. These are rounded to integers and categorized relative to par:

$$\text{diff} = \text{round}(\text{totalStrokes}) - \text{par}$$

  $\leq -2$ → Eagle
  $-1$ → Birdie
  $0$ → Par
  $+1$ → Bogey
  $+2$ → Double
  $> +2$ → Worse

These counts are converted to probabilities (e.g., 40% par, 30% bogey) and displayed as a stacked color bar on each strategy card. The blow-up risk badge is shown when $P(\text{double}) + P(\text{worse}) > 5\%$.`}</P>

          <H4>Caddy tips</H4>
          <P>{String.raw`Each shot in the optimal plan gets a natural-language caddy tip describing where to aim and what to watch for. The tip has three components:`}</P>
          <P>{String.raw`1. Aim direction — computed as the angular difference between the direct line to target and the bias-compensated aim line. If the shift is more than 1°, the tip says "Aim left" or "Aim right."

2. Ball movement — describes your expected lateral bias. If $\mu_\text{offline} > 1$, the tip says "works right to the pin" (or "to the fairway" for tee shots).

3. Hazard reference — the tip names the most relevant hazard near the shot path. Hazards are found by searching two zones:
  a. Within 50 yards of the aim point (near the target)
  b. Along the flight corridor — perpendicular distance $\leq$ 35 yards from the shot line, between 20% and 120% of the shot distance

The perpendicular distance to the shot line uses:
$$d_\perp = d_\text{origin} \cdot \sin(\Delta\theta)$$
$$d_\parallel = d_\text{origin} \cdot \cos(\Delta\theta)$$

where $d_\text{origin}$ is the haversine distance from the shot origin to the hazard centroid and $\Delta\theta$ is the bearing difference. Hazards are ranked by $\min(d_\text{aim}, d_\perp)$ — closest to either the aim point or the flight path wins.

Example tip: "Aim left of the right bunker, works right to the pin"`}</P>

          <H4>Carry notes</H4>
          <P>{String.raw`Each shot also gets a carry distance note with context, like "+20y past bunker" or "~5y short of water." The algorithm finds hazards along the shot bearing (within 35°), computes the distance from the origin to the nearest polygon vertex (not centroid — more accurate for long/narrow hazards like tree lines), and reports the clearance:

$$\text{clearance} = \text{carry} - d_\text{hazard}$$

Positive clearance → "+Ny past [hazard]"
Negative clearance → "~Ny short of [hazard]"`}</P>

          <H4>Game Plan</H4>
          <P>{String.raw`The game plan runs the DP optimizer across all 18 holes and produces a complete round strategy. For each hole, all 3 modes are solved and the plan picks the strategy matching the selected mode (Scoring, Safe, or Aggressive). Each hole card shows the club sequence, expected strokes, caddy tips, and a score distribution bar.`}</P>
          <P>{String.raw`The summary shows your expected total score, plays-like yardage, and an aggregate score breakdown. It also identifies "key holes" — the 4 holes where your strategy choice makes the biggest difference. Key holes are computed by comparing the Scoring and Safe mode expected strokes:

$$\text{delta}_h = |xS_\text{scoring} - xS_\text{safe}|$$

The top 4 holes by delta are flagged with a gold KEY badge — these are the holes where playing it safe vs. aggressive costs (or saves) the most strokes. Game plans are cached on the server and auto-regenerate when your practice data changes (new sessions, updated clubs) or when the optimizer code is updated.`}</P>

          <H4>Three scoring modes</H4>
          <P>{String.raw`All three modes share the same transition table (the expensive 800K-sample computation) and differ only in their objective function during value iteration:

Scoring — minimizes pure expected strokes. This mode finds the mathematically optimal strategy, favoring aggressive plays when the risk-reward is positive. It might tell you to go for a par 5 in two even if there's water in front of the green, because the strokes saved on successful attempts outweigh the penalty on misses.

Safe — adds a $+0.5\sigma$ variance penalty. This mode prefers consistent plays over volatile ones. Even if a play averages 0.1 strokes better, the Safe optimizer will reject it if the penalty variance is high. It steers you away from water carries and tight landing zones.

Aggressive — subtracts $-0.3 \cdot P(\text{green})$ for green-reaching actions. This mode actively hunts for birdies by rewarding shots that can reach the putting surface. On par 5s, it favors going for the green in two. On short par 4s, it may recommend driver over 3-wood even with more risk, because reaching the green in one opens up eagle chances.`}</P>

          <H4>Template fallback</H4>
          <P>{`If the DP optimizer returns no results for a hole (e.g., missing fairway or green polygon data), the system falls back to pre-defined strategy templates: Par 3 (Pin Hunting / Center Green / Bail Out), Par 4 (Conservative / Aggressive / Layup), Par 5 (Conservative 3-Shot / Go-For-It / Safe Layup). These use the same Monte Carlo simulation for scoring but with fixed club/aim selections instead of optimized ones.`}</P>

          <H4>Computation budget</H4>
          <P>{String.raw`The DP optimizer's computation breaks down as follows:

Transition sampling: $50 \text{ zones} \times 80 \text{ actions} \times 200 \text{ samples} = 800\text{K samples}$ (built once, shared across all modes)

Value iteration: $50 \text{ zones} \times 80 \text{ actions} \times 3 \text{ modes} \times \sim\!10 \text{ iterations} \approx 120\text{K evaluations}$

Policy Monte Carlo: $3 \text{ modes} \times 2{,}000 \text{ trials} = 6\text{K trials}$

Total: ~4–5 seconds per hole, ~80 seconds for 18 holes. All computation runs server-side so the client stays responsive.`}</P>

          <H4>Constants reference</H4>
          <P>{String.raw`  Zone interval — 20 yards (distance between zone markers)
  Lateral offset — 20 yards (left/right from center line)
  Bearing step — 5° (aim bearing increment)
  Bearing range — $\pm$30° from pin bearing (13 bearings total)
  Samples per action — 200 (Gaussian shots for transition table)
  Rough lie multiplier — 1.15× std deviation
  Green threshold — 10 yards (ball is "on the green")
  Chip zone — 10–40 yards (1 chip + putts from 3y)
  Max shots per hole — 8 (safety cap)
  Trials per strategy — 2,000 (Monte Carlo policy scoring)
  Tree canopy height — 15 yards (45 ft)
  Fallback ball apex — 28 yards (84 ft)
  Flight corridor width — 35 yards perpendicular
  Caddy tip aim radius — 50 yards around aim point
  Carry note bearing threshold — 35°
  Value iteration convergence — max change < 0.001 or 50 iterations
  Safe mode variance weight — 0.5
  Aggressive mode green bonus — 0.3`}</P>
        </Card>
      </div>
    </>
  );
}
