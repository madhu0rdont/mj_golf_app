import { H3, H4, P, DiagramCaption, C } from './help-primitives';

function BlockedVsInterleavedDiagram() {
  const clubs = [C.blue, C.blue, C.blue, C.blue, C.orange, C.orange, C.orange, C.orange, C.purple, C.purple, C.purple, C.purple];
  const interleaved = [C.blue, C.orange, C.purple, C.blue, C.purple, C.orange, C.blue, C.orange, C.purple, C.orange, C.blue, C.purple];
  const r = 8;
  const gap = 26;
  const x0 = 80;
  const w = x0 + clubs.length * gap + 10;

  return (
    <svg viewBox={`0 0 ${w} 90`} className="w-full" style={{ maxHeight: 90 }}>
      <text x={8} y={28} fontSize="11" fill={C.muted} fontFamily="system-ui" fontWeight="500">Blocked</text>
      <text x={8} y={68} fontSize="11" fill={C.muted} fontFamily="system-ui" fontWeight="500">Random</text>
      {clubs.map((c, i) => (
        <circle key={`b-${i}`} cx={x0 + i * gap} cy={24} r={r} fill={c} fillOpacity={0.8} />
      ))}
      {interleaved.map((c, i) => (
        <circle key={`r-${i}`} cx={x0 + i * gap} cy={64} r={r} fill={c} fillOpacity={0.8} />
      ))}
    </svg>
  );
}

function RetentionCrossoverDiagram() {
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
      <line x1={ml} y1={mt} x2={ml} y2={h - mb} stroke={C.faint} strokeWidth="1" />
      <line x1={ml} y1={h - mb} x2={w - mr} y2={h - mb} stroke={C.faint} strokeWidth="1" />
      <text x={8} y={mt + ph / 2} fontSize="9" fill={C.muted} fontFamily="system-ui" textAnchor="middle" transform={`rotate(-90, 8, ${mt + ph / 2})`}>
        Error
      </text>
      <text x={toX(0)} y={h - mb + 16} fontSize="9" fill={C.muted} fontFamily="system-ui" textAnchor="middle">Practice</text>
      <text x={toX(1)} y={h - mb + 16} fontSize="9" fill={C.muted} fontFamily="system-ui" textAnchor="middle">1 Week Later</text>
      <line x1={toX(0.5)} y1={mt} x2={toX(0.5)} y2={h - mb} stroke={C.faint} strokeWidth="0.5" strokeDasharray="3 3" />
      <polyline points={toPath(blockedPts).replace('M ', '')} fill="none" stroke={C.coral} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={toPath(randomPts).replace('M ', '')} fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1={ml + 8} y1={mt + 4} x2={ml + 22} y2={mt + 4} stroke={C.coral} strokeWidth="2" />
      <text x={ml + 26} y={mt + 7} fontSize="9" fill={C.coral} fontFamily="system-ui">Blocked</text>
      <line x1={ml + 80} y1={mt + 4} x2={ml + 94} y2={mt + 4} stroke={C.primary} strokeWidth="2" />
      <text x={ml + 98} y={mt + 7} fontSize="9" fill={C.primary} fontFamily="system-ui">Random</text>
    </svg>
  );
}

export default function InterleavedHelpContent() {
  return (
    <>
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
    </>
  );
}
