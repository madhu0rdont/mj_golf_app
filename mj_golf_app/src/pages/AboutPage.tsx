import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';

const FAQ_ITEMS = [
  // ── Yardages ──
  {
    question: 'How are yardage book numbers calculated?',
    answer:
      'Each club\'s "book carry" is a recency-weighted average across all practice sessions. ' +
      'Each session\'s average carry gets a weight based on how old it is:\n\n' +
      '  w(t) = 0.5 ^ (t / 30)\n\n' +
      'where t is the age in days and 30 is the half-life. A session from today has weight 1.0, ' +
      '30 days ago has weight 0.5, 60 days has 0.25, and so on. The book carry is then:\n\n' +
      '  bookCarry = \u03A3(carry\u1D62 \u00B7 w\u1D62) / \u03A3(w\u1D62)\n\n' +
      'This is an exponential moving average — recent sessions dominate, but older data ' +
      'still contributes so one bad day on the range won\'t blow up your numbers. Dispersion, ' +
      'spin rate, and launch angle are weighted the same way.',
  },
  {
    question: 'What do Fresh, Aging, and Stale mean?',
    answer:
      'Each club has a freshness badge based on how recently you\'ve hit it on the monitor:\n\n' +
      '  Fresh — last session < 14 days ago\n' +
      '  Aging — 14 to 45 days ago\n' +
      '  Stale — > 45 days ago\n\n' +
      'Stale clubs still have valid book numbers (the weighted average doesn\'t expire), ' +
      'but the weights will be small. The home page warns you when clubs are stale so you know ' +
      'which ones to prioritize at the range.',
  },
  // ── Imputation ──
  {
    question: 'How are missing club distances imputed?',
    answer:
      'Two methods depending on what data you have:\n\n' +
      '1. Known carry + loft (no shot data):\n' +
      'The app scales Trackman PGA Tour reference data to your level. It looks up the tour ' +
      'carry at your club\'s loft, computes a scaling factor s = yourCarry / tourCarry, ' +
      'then applies it:\n\n' +
      '  ballSpeed = tourBallSpeed \u00B7 s\n' +
      '  apexHeight = tourApex \u00B7 s\n' +
      '  spinRate = tourSpin \u00B7 (0.7 + 0.3s)\n' +
      '  launchAngle = tourLaunch (loft-driven, unscaled)\n' +
      '  descentAngle = tourDescent (loft-driven, unscaled)\n' +
      '  total = carry \u00B7 (1 + 0.12 \u00B7 e\u207B\u2070\u22C5\u2070\u2075 \u02E1\u1D52\u1DA0\u1D57)\n\n' +
      'The rollout fraction decays exponentially with loft — a driver (10.5\u00B0) rolls out ~7%, ' +
      'while a lob wedge (60\u00B0) gets essentially zero rollout.\n\n' +
      '2. No carry at all:\n' +
      'Piecewise linear interpolation between your other clubs\' known data, using loft as the ' +
      'independent variable. With 2+ anchor points, it fits a line between each adjacent pair ' +
      'and extrapolates beyond the endpoints. More clubs on the monitor = better estimates.',
  },
  {
    question: 'Where does the tour reference data come from?',
    answer:
      'The imputation engine uses 14 reference points from Trackman PGA Tour averages, ' +
      'covering every loft from driver (10.5\u00B0) to lob wedge (60\u00B0). Each point includes ' +
      'carry, total, ball speed, launch angle, spin rate, apex height, and descent angle.\n\n' +
      'These serve as a "shape template" — the relationships between metrics at each loft are ' +
      'well-established by physics, even if absolute values differ between players. Scaling by ' +
      'carry-to-tour ratio captures your swing speed implicitly without needing to measure it directly.',
  },
  // ── Remaining Distance Model ──
  {
    question: 'How is remaining distance calculated during a hole?',
    answer:
      'After each shot, the app computes your true distance from the pin using an iterative ' +
      'Pythagorean model. Each shot is assumed to be aimed at the hole:\n\n' +
      '  forward = trueRemaining \u2212 carry\n' +
      '  trueRemaining\u2032 = \u221A(forward\u00B2 + offline\u00B2)\n\n' +
      'If you overshoot (carry > remaining), forward goes negative — you\'re past the pin. ' +
      'If you miss offline, you end up farther than a pure carry number would suggest. ' +
      'The Pythagorean distance captures both effects in a single scalar.\n\n' +
      'A hole is complete when trueRemaining \u2264 10 yards (on the green). ' +
      'The app then assumes 2 putts and scores the hole as strokes + 2.',
  },
  // ── Monte Carlo ──
  {
    question: 'How does the Monte Carlo simulation work?',
    answer:
      'For each shot during interleaved practice, the app builds a statistical profile for each club ' +
      'from your real shot data (minimum 3 shots):\n\n' +
      '  \u03BC_carry, \u03C3_carry  (mean and standard deviation of carry)\n' +
      '  \u03BC_offline, \u03C3_offline  (mean and std dev of lateral miss)\n\n' +
      'It then enumerates candidate club sequences based on the distance:\n\n' +
      '  \u2264 225 yds \u2192 1-club plans\n' +
      '  226\u2013425 yds \u2192 2-club plans\n' +
      '  > 425 yds \u2192 2-club + 3-club plans\n\n' +
      'Each candidate is filtered so the sum of mean carries is close to the target distance ' +
      '(\u00B160 yds for par 4, \u00B180 yds for par 5).\n\n' +
      'For each candidate, the simulator runs 2,000 independent trials. Each shot is sampled:\n\n' +
      '  carry ~ N(\u03BC_carry, \u03C3_carry)\n' +
      '  offline ~ N(\u03BC_offline, \u03C3_offline)\n\n' +
      'using the Box-Muller transform for Gaussian random numbers:\n\n' +
      '  z = \u221A(\u22122 ln u\u2081) \u00B7 cos(2\u03C0 u\u2082),  u\u2081,u\u2082 ~ Uniform(0,1)\n\n' +
      'After the planned clubs, if not on the green, a greedy policy takes over (pick the club ' +
      'with meanCarry closest to remaining). Score = strokes + 2 putts. ' +
      'Strategies are ranked by E[score] = (1/N) \u03A3 score\u1D62 and the top 3 are shown.',
  },
  {
    question: 'Why 2,000 trials? Is that enough?',
    answer:
      'For a sample mean of a bounded random variable, the standard error scales as ' +
      '\u03C3 / \u221AN. Golf scores per hole typically have \u03C3 \u2248 0.5\u20131.0 strokes, ' +
      'so with N = 2,000:\n\n' +
      '  SE \u2248 1.0 / \u221A2000 \u2248 0.022 strokes\n\n' +
      'That means strategy rankings are accurate to about \u00B10.05 strokes with 95% confidence — ' +
      'more than enough to reliably distinguish a 3.2 vs 3.4 stroke strategy.\n\n' +
      'For par 5s, the 3-club enumeration can produce many candidates. To keep the total computation ' +
      'bounded at ~400k simulations, trials are scaled down proportionally (minimum 500). ' +
      'Even at 500 trials, SE \u2248 0.045 — still sharp enough for a top-3 ranking.',
  },
  {
    question: 'When does the simulation re-run vs. use simple suggestions?',
    answer:
      'The Monte Carlo strategy card appears on every shot where the remaining distance is greater ' +
      'than your longest full wedge carry. After each shot, it re-runs with the new remaining distance ' +
      'and a fresh set of candidate combos.\n\n' +
      'Once you\'re within wedge range, the simulation stops and a simple greedy recommendation takes ' +
      'over — it picks the club (including wedge positions at 100%, 85%, and 65% carry and grip-down ' +
      'options at \u22125 yds/inch) whose carry is closest to the remaining distance.\n\n' +
      'If you don\'t have enough shot data for Monte Carlo (< 3 shots for any club), ' +
      'the greedy recommendation is used for all shots.',
  },
  // ── Scoring ──
  {
    question: 'What is the Scoring Zone metric?',
    answer:
      'The scoring zone measures how efficiently you get the ball within 100 yards of the pin — ' +
      'the part of the hole where short game takes over.\n\n' +
      '  target = par \u2212 2  (strokes to reach 100 yds)\n' +
      '  actual = first stroke index where trueRemaining \u2264 100\n' +
      '  delta = actual \u2212 target\n\n' +
      'On a par 4, you should reach 100 yards in 2 strokes. If it takes 3, your delta is +1. ' +
      'On a par 5, the target is 3. Not applicable on par 3s where the tee is already \u2264 100 yards.\n\n' +
      'A negative delta means you\'re getting into scoring position faster than expected — ' +
      'your long game is outperforming your handicap. A positive delta means you\'re ' +
      'losing strokes before you even reach the green complex.',
  },
];

export function AboutPage() {
  const year = new Date().getFullYear();
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
      <TopBar title="About" showBack />
      <div className="px-4 py-4">
        {/* App Info */}
        <div className="rounded-xl border border-border bg-card p-4 mb-4 text-center">
          <h2 className="text-xl font-bold text-text-dark">MJ Golf</h2>
          <p className="text-sm text-text-muted mt-1">
            Club Distances & Yardage Book for Foresight GC4
          </p>
          <p className="text-xs text-text-faint mt-1">v1.0.0</p>
        </div>

        {/* FAQ */}
        <div className="rounded-xl border border-border bg-card p-4 mb-4">
          <h3 className="text-sm font-medium text-text-medium uppercase mb-1">FAQ</h3>
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
                      {item.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Developer */}
        <div className="rounded-xl border border-border bg-card p-4 mb-4">
          <h3 className="text-sm font-medium text-text-medium uppercase mb-3">Developer</h3>
          <p className="text-base font-semibold text-text-dark">Madhukrishna Josyula</p>
          <div className="mt-2 space-y-1 text-sm text-text-medium">
            <p>👋 Hi, I'm @madhu0rdont</p>
            <p>👀 Interested in cavapoos, triathlons and art</p>
            <p>🌱 Currently learning daily</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="https://www.linkedin.com/in/madhujosyula/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary-pale transition"
            >
              LinkedIn
            </a>
            <a
              href="https://github.com/madhu0rdont"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary-pale transition"
            >
              GitHub
            </a>
            <a
              href="https://x.com/madhuOrDie"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary-pale transition"
            >
              X
            </a>
          </div>
        </div>

        {/* Copyright */}
        <p className="text-center text-xs text-text-muted">
          &copy; {year} Madhukrishna Josyula. All rights reserved.
        </p>
      </div>
    </>
  );
}
