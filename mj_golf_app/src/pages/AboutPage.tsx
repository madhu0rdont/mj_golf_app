import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';

const FAQ_ITEMS = [
  {
    question: 'How are yardage averages calculated?',
    answer:
      'Each club\'s "book carry" is a recency-weighted average across all your practice sessions. ' +
      'It uses exponential decay with a 30-day half-life — a session from today counts at full weight, ' +
      'a session from 30 days ago counts at half weight, 60 days at a quarter, and so on. ' +
      'This means your most recent range sessions have the biggest influence on your numbers, ' +
      'but older data still contributes so a single outlier session won\'t throw things off.',
  },
  {
    question: 'How are missing club distances filled in?',
    answer:
      'If you have a club with a known carry distance and loft but no shot data from the launch monitor, ' +
      'the app estimates its flight metrics (ball speed, apex height, spin, etc.) using Trackman PGA Tour ' +
      'reference data as a baseline. It looks up the tour average at your club\'s loft, then scales ' +
      'speed-related numbers by the ratio of your carry to the tour carry. Loft-driven metrics like ' +
      'launch angle and descent angle are taken from the tour data directly since they don\'t change ' +
      'much between players.\n\n' +
      'For clubs with no carry data at all, the app interpolates between your other clubs that do have data, ' +
      'using their lofts as anchor points. The more clubs you\'ve hit on the monitor, the more accurate ' +
      'the estimates for the ones you haven\'t.',
  },
  {
    question: 'How do Smart Club Recommendations work?',
    answer:
      'During interleaved practice, the app runs a Monte Carlo simulation — 2,000 randomized trials — ' +
      'to find the best multi-club approach for each shot. It uses your actual shot data to build a ' +
      'statistical profile for each club: how far you carry on average, how much that varies, and how ' +
      'far offline you tend to miss.\n\n' +
      'It then tests different club combinations (e.g. 5 Wood then Sand Wedge vs. 7 Iron then 7 Iron) ' +
      'by simulating 2,000 holes for each combo. Every simulated shot is randomly drawn from that club\'s ' +
      'real dispersion pattern, and the remaining distance is recalculated after each shot. ' +
      'The combos are ranked by average total strokes, and the top 3 are shown.\n\n' +
      'The simulation re-runs after every shot until you\'re close enough for a wedge, ' +
      'then it switches to a simple nearest-distance recommendation. For par 5 distances, ' +
      'it also evaluates 3-club layup strategies alongside aggressive 2-club approaches.',
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
              href="https://twitter.com/madhu0rdie"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary-pale transition"
            >
              Twitter
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
