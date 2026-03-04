import { H3, H4, P, DiagramCaption, C } from './help-primitives';

function SimulationFlowDiagram() {
  const w = 320;
  const h = 110;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 110 }}>
      <rect x={10} y={15} width={300} height={70} rx={8} fill="#1B4332" />
      <circle cx={35} cy={50} r={5} fill={C.card} />
      <text x={35} y={98} fontSize="8" fill={C.muted} fontFamily="system-ui" textAnchor="middle">250 yds</text>
      {[-18, -10, -3, 4, 12, 20].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const len = 100 + (i % 3) * 15;
        const ex = 35 + Math.cos(rad) * len;
        const ey = 50 - Math.sin(rad) * len;
        return <line key={`s1-${i}`} x1={35} y1={50} x2={ex} y2={ey} stroke={C.primaryLight} strokeWidth="0.7" strokeOpacity="0.5" strokeDasharray="2 2" />;
      })}
      {[[-2, 3], [4, -5], [-1, -2], [6, 1], [2, 6], [-4, -1]].map(([dx, dy], i) => (
        <circle key={`d1-${i}`} cx={155 + dx} cy={50 + dy} r={2} fill={C.gold} fillOpacity={0.7} />
      ))}
      {[-15, -5, 5, 15].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const len = 80 + (i % 2) * 12;
        const ex = 155 + Math.cos(rad) * len;
        const ey = 50 - Math.sin(rad) * len;
        return <line key={`s2-${i}`} x1={155} y1={50} x2={ex} y2={ey} stroke={C.gold} strokeWidth="0.7" strokeOpacity="0.4" strokeDasharray="2 2" />;
      })}
      <line x1={280} y1={25} x2={280} y2={60} stroke={C.card} strokeWidth="1.5" />
      <polygon points="280,25 295,31 280,37" fill={C.coral} />
      <circle cx={280} cy={60} r={3} fill={C.card} fillOpacity={0.5} />
      {[[0, 2], [3, -3], [-2, 1], [4, -1], [-1, -4], [1, 3]].map(([dx, dy], i) => (
        <circle key={`d2-${i}`} cx={270 + dx} cy={50 + dy} r={2} fill={C.coral} fillOpacity={0.6} />
      ))}
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
      <line x1={ml} y1={mt} x2={ml} y2={h - mb} stroke={C.faint} strokeWidth="1" />
      <line x1={ml} y1={h - mb} x2={w - mr} y2={h - mb} stroke={C.faint} strokeWidth="1" />
      {[1.0, 1.5, 2.0, 2.5].map((v) => (
        <g key={v}>
          <line x1={ml - 3} y1={toY(v)} x2={ml} y2={toY(v)} stroke={C.faint} strokeWidth="1" />
          <text x={ml - 6} y={toY(v) + 3} fontSize="8" fill={C.muted} fontFamily="system-ui" textAnchor="end">{v.toFixed(1)}</text>
          <line x1={ml} y1={toY(v)} x2={w - mr} y2={toY(v)} stroke={C.faint} strokeWidth="0.3" strokeDasharray="2 3" />
        </g>
      ))}
      {[5, 10, 15, 20].map((d) => (
        <g key={d}>
          <line x1={toX(d)} y1={h - mb} x2={toX(d)} y2={h - mb + 3} stroke={C.faint} strokeWidth="1" />
          <text x={toX(d)} y={h - mb + 14} fontSize="8" fill={C.muted} fontFamily="system-ui" textAnchor="middle">{d}</text>
        </g>
      ))}
      <text x={6} y={mt + ph / 2} fontSize="9" fill={C.muted} fontFamily="system-ui" textAnchor="middle" transform={`rotate(-90, 6, ${mt + ph / 2})`}>
        Expected Putts
      </text>
      <text x={ml + pw / 2} y={h - 2} fontSize="9" fill={C.muted} fontFamily="system-ui" textAnchor="middle">Distance to pin (yds)</text>
      <polyline
        points={curve.map(([d, p]) => `${toX(d)},${toY(p)}`).join(' ')}
        fill="none"
        stroke={C.primary}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {labels.map(({ d, p, text }) => (
        <g key={d}>
          <circle cx={toX(d)} cy={toY(p)} r={3.5} fill={C.gold} stroke={C.card} strokeWidth="1.5" />
          <text x={toX(d) + 6} y={toY(p) - 6} fontSize="9" fill={C.gold} fontFamily="system-ui" fontWeight="600">{text}</text>
        </g>
      ))}
    </svg>
  );
}

export default function ClubSelectionHelpContent() {
  return (
    <>
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
    </>
  );
}
