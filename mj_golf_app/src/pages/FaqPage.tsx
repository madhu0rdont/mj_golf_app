import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';
import { TopBar } from '../components/layout/TopBar';

/**
 * Renders a string containing $...$ (inline) and $$...$$ (block) LaTeX
 * delimiters into React nodes with KaTeX math rendering.
 */
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

const FAQ_ITEMS = [
  // ── Yardages ──
  {
    question: 'How are yardage book numbers calculated?',
    answer: String.raw`Each club's "book carry" is a recency-weighted average across all practice sessions. Each session's average carry gets a weight based on how old it is:

$$w(t) = 0.5^{\,t/30}$$

where $t$ is the age in days and 30 is the half-life. A session from today has weight 1.0, 30 days ago has weight 0.5, 60 days has 0.25, and so on. The book carry is then:

$$\text{bookCarry} = \frac{\sum(\text{carry}_i \cdot w_i)}{\sum w_i}$$

This is an exponential moving average — recent sessions dominate, but older data still contributes so one bad day on the range won't blow up your numbers. Dispersion, spin rate, and launch angle are weighted the same way.`,
  },
  {
    question: 'What do Fresh, Aging, and Stale mean?',
    answer: `Each club has a freshness badge based on how recently you've hit it on the monitor:

  Fresh — last session < 14 days ago
  Aging — 14 to 45 days ago
  Stale — > 45 days ago

Stale clubs still have valid book numbers (the weighted average doesn't expire), but the weights will be small. The home page warns you when clubs are stale so you know which ones to prioritize at the range.`,
  },
  // ── Imputation ──
  {
    question: 'How are missing club distances imputed?',
    answer: String.raw`Two methods depending on what data you have:

1. Known carry + loft (no shot data):
The app scales Trackman PGA Tour reference data to your level. It looks up the tour carry at your club's loft, computes a scaling factor:

$$s = \frac{\text{yourCarry}}{\text{tourCarry}}$$

then scales speed-dependent metrics:

$$\begin{aligned} \text{ballSpeed} &= \text{tourBallSpeed} \cdot s \\ \text{apexHeight} &= \text{tourApex} \cdot s \\ \text{spinRate} &= \text{tourSpin} \cdot (0.7 + 0.3\,s) \end{aligned}$$

Loft-driven metrics (launch angle, descent angle) come directly from tour data. Rollout is estimated as:

$$\text{total} = \text{carry} \cdot \left(1 + 0.12 \cdot e^{-0.05 \cdot \text{loft}}\right)$$

The rollout fraction decays exponentially with loft — a driver (10.5°) rolls out ~7%, while a lob wedge (60°) gets essentially zero rollout.

2. No carry at all:
Piecewise linear interpolation between your other clubs' known data, using loft as the independent variable. With 2+ anchor points, it fits a line between each adjacent pair and extrapolates beyond the endpoints. More clubs on the monitor = better estimates.`,
  },
  {
    question: 'Where does the tour reference data come from?',
    answer: `The imputation engine uses 14 reference points from Trackman PGA Tour averages, covering every loft from driver (10.5°) to lob wedge (60°). Each point includes carry, total, ball speed, launch angle, spin rate, apex height, and descent angle.

These serve as a "shape template" — the relationships between metrics at each loft are well-established by physics, even if absolute values differ between players. Scaling by carry-to-tour ratio captures your swing speed implicitly without needing to measure it directly.`,
  },
  // ── Remaining Distance Model ──
  {
    question: 'How is remaining distance calculated during a hole?',
    answer: String.raw`After every shot, the app re-aims at the hole and recalculates your true distance using the Pythagorean theorem:

$$\text{trueRemaining}' = \sqrt{(\text{remaining} - \text{carry})^2 + \text{offline}^2}$$

This matters because lateral misses cost you real distance. If you're 50 yards out, carry 40, but miss 10 yards right, you're not 10 yards away — you're $\sqrt{10^2 + 10^2} \approx 14$ yards away.

Example — Par 4, 300 yards:

  Shot 1: Mini Driver, 251 carry, 25R
  $\sqrt{49^2 + 25^2} = \sqrt{3026} \approx 55$ yds left

  Shot 2: 58°, 50 carry, 5R (re-aimed at hole)
  $\sqrt{5^2 + 5^2} = \sqrt{50} \approx 7$ yds left → on the green

Key: after each shot, the app reorients toward the hole. The 5R on shot 2 is relative to the new aim line, not the original tee line. Offline misses don't accumulate — each shot gets a fresh start at the pin.

If you overshoot ($\text{carry} > \text{remaining}$), you're past the pin and the forward component goes negative. A hole is complete when $\text{trueRemaining} \leq 10$ yards, then the app estimates putts based on proximity to the pin (see the putting model FAQ).`,
  },
  // ── Monte Carlo ──
  {
    question: 'How does the Monte Carlo simulation work?',
    answer: String.raw`For each shot during interleaved practice, the app builds a statistical profile for each club from your real shot data (minimum 3 shots):

$$\mu_{\text{carry}},\; \sigma_{\text{carry}} \quad \small\text{(mean and std dev of carry)}$$
$$\mu_{\text{offline}},\; \sigma_{\text{offline}} \quad \small\text{(mean and std dev of lateral miss)}$$

It then enumerates candidate club sequences based on the distance:

  ≤ 225 yds → 1-club plans
  226–425 yds → 2-club plans
  > 425 yds → 2-club + 3-club plans

Each candidate is filtered so the sum of mean carries is within range of the target distance.

For each candidate, the simulator runs 2,000 independent trials. Each shot is sampled from a normal distribution:

$$\text{carry} \sim \mathcal{N}\!\left(\mu_{\text{carry}},\; \sigma_{\text{carry}}\right)$$
$$\text{offline} \sim \mathcal{N}\!\left(\mu_{\text{offline}},\; \sigma_{\text{offline}}\right)$$

using the Box-Muller transform for Gaussian random numbers:

$$z = \sqrt{-2 \ln u_1} \cdot \cos(2\pi\, u_2), \quad u_1, u_2 \sim \text{Uniform}(0,1)$$

After the planned clubs, if not on the green, a greedy policy takes over (pick the club with mean carry closest to remaining). Strategies are ranked by $E[\text{score}] = \frac{1}{N} \sum \text{score}_i$ and the top 3 are shown.`,
  },
  {
    question: 'How does the putting model work?',
    answer: String.raw`Instead of assuming a flat 2 putts, the simulation estimates putts based on how close you finish to the pin using a log-curve fitted to PGA strokes-gained data:

$$\text{putts}(d) = 1.0 + 0.42 \cdot \ln(d)$$

where $d$ is the distance to the pin in yards. This means:

  1 yard → 1.0 putts
  3 yards → 1.5 putts
  5 yards → 1.7 putts
  10 yards → 2.0 putts
  20 yards → 2.3 putts

This matters because it rewards strategies that consistently land close to the pin. Two strategies might both reach the green in 2 shots, but if one averages 4 yards from the pin and the other averages 9 yards, the first will score ~0.3 strokes better per hole — a significant edge over a round.

If a shot lands in the chip zone (too close for a full swing but not on the green), the simulator adds 1 chip stroke and assumes the chip leaves you ~3 yards from the pin.`,
  },
  {
    question: 'Why 2,000 trials? Is that enough?',
    answer: String.raw`For a sample mean of a bounded random variable, the standard error scales as $\sigma / \sqrt{N}$. Golf scores per hole typically have $\sigma \approx 0.5\text{–}1.0$ strokes, so with $N = 2{,}000$:

$$\text{SE} \approx \frac{1.0}{\sqrt{2000}} \approx 0.022 \;\text{strokes}$$

That means strategy rankings are accurate to about ±0.05 strokes with 95% confidence — more than enough to reliably distinguish a 3.2 vs 3.4 stroke strategy.

For par 5s, the 3-club enumeration can produce many candidates. To keep the total computation bounded at ~400k simulations, trials are scaled down proportionally (minimum 500). Even at 500 trials, $\text{SE} \approx 0.045$ — still sharp enough for a top-3 ranking.`,
  },
  {
    question: 'When does the simulation re-run vs. use simple suggestions?',
    answer: `The Monte Carlo strategy card appears on every shot where the remaining distance is greater than your longest full wedge carry. After each shot, it re-runs with the new remaining distance and a fresh set of candidate combos.

Once you're within wedge range, the simulation stops and a simple greedy recommendation takes over — it picks the club (including wedge positions at 100%, 85%, and 65% carry and grip-down options at −5 yds/inch) whose carry is closest to the remaining distance.

If you don't have enough shot data for Monte Carlo (< 3 shots for any club), the greedy recommendation is used for all shots.`,
  },
  // ── Scoring ──
  {
    question: 'What is the Scoring Zone metric?',
    answer: String.raw`The scoring zone measures how efficiently you get the ball within 100 yards of the pin — the part of the hole where short game takes over.

$$\begin{aligned} \text{target} &= \text{par} - 2 \quad \small\text{(strokes to reach 100 yds)} \\[4pt] \text{actual} &= \text{first stroke where remaining} \leq 100 \\[4pt] \delta &= \text{actual} - \text{target} \end{aligned}$$

On a par 4, you should reach 100 yards in 2 strokes. If it takes 3, your $\delta$ is +1. On a par 5, the target is 3. Not applicable on par 3s where the tee is already ≤ 100 yards.

A negative $\delta$ means you're getting into scoring position faster than expected — your long game is outperforming your handicap. A positive $\delta$ means you're losing strokes before you even reach the green complex.`,
  },
];

export function FaqPage() {
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());

  const toggle = (index: number) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <>
      <TopBar title="FAQ" showBack />
      <div className="px-4 py-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="divide-y divide-border">
            {FAQ_ITEMS.map((item, i) => {
              const isOpen = openItems.has(i);
              return (
                <div key={i}>
                  <button
                    onClick={() => toggle(i)}
                    className="flex w-full items-center justify-between py-3 text-left"
                  >
                    <span className="text-sm font-medium text-text-dark pr-2">
                      {item.question}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`flex-shrink-0 text-text-muted transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="pb-3 text-sm text-text-medium leading-relaxed whitespace-pre-line">
                      {renderMath(item.answer)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
