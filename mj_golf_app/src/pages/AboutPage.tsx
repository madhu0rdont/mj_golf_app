import { TopBar } from '../components/layout/TopBar';

export function AboutPage() {
  const year = new Date().getFullYear();

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
