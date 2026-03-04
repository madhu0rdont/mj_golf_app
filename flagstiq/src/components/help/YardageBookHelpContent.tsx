import { H3, H4, P, DiagramCaption, C } from './help-primitives';

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

  const curve: [number, number][] = [];
  for (let d = 0; d <= 90; d += 2) {
    curve.push([d, Math.pow(0.5, d / 30)]);
  }

  const sessions = [
    { days: 2 },
    { days: 12 },
    { days: 30 },
    { days: 55 },
    { days: 75 },
  ];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 130 }}>
      <line x1={ml} y1={mt} x2={ml} y2={h - mb} stroke={C.faint} strokeWidth="1" />
      <line x1={ml} y1={h - mb} x2={w - mr} y2={h - mb} stroke={C.faint} strokeWidth="1" />
      {[1.0, 0.5, 0.25].map((v) => (
        <g key={v}>
          <line x1={ml - 3} y1={toY(v)} x2={ml} y2={toY(v)} stroke={C.faint} strokeWidth="1" />
          <text x={ml - 6} y={toY(v) + 3} fontSize="8" fill={C.muted} fontFamily="system-ui" textAnchor="end">{v}</text>
          <line x1={ml} y1={toY(v)} x2={w - mr} y2={toY(v)} stroke={C.faint} strokeWidth="0.3" strokeDasharray="2 3" />
        </g>
      ))}
      {[0, 30, 60, 90].map((d) => (
        <g key={d}>
          <line x1={toX(d)} y1={h - mb} x2={toX(d)} y2={h - mb + 3} stroke={C.faint} strokeWidth="1" />
          <text x={toX(d)} y={h - mb + 14} fontSize="8" fill={C.muted} fontFamily="system-ui" textAnchor="middle">{d}d</text>
        </g>
      ))}
      <text x={6} y={mt + ph / 2} fontSize="9" fill={C.muted} fontFamily="system-ui" textAnchor="middle" transform={`rotate(-90, 6, ${mt + ph / 2})`}>
        Weight
      </text>
      <text x={ml + pw / 2} y={h - 2} fontSize="9" fill={C.muted} fontFamily="system-ui" textAnchor="middle">Days ago</text>
      <polyline
        points={curve.map(([d, wt]) => `${toX(d)},${toY(wt)}`).join(' ')}
        fill="none"
        stroke={C.primary}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {sessions.map(({ days }) => {
        const wt = Math.pow(0.5, days / 30);
        return (
          <circle key={days} cx={toX(days)} cy={toY(wt)} r={4} fill={C.gold} stroke={C.card} strokeWidth="1.5" />
        );
      })}
    </svg>
  );
}

export default function YardageBookHelpContent() {
  return (
    <>
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
    </>
  );
}
