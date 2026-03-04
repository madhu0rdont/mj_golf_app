import { lazy, Suspense, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { YardagesTab } from '../components/yardage/YardagesTab';
import { WedgeMatrixTab } from '../components/yardage/WedgeMatrixTab';
import { DetailsTab } from '../components/yardage/DetailsTab';
import { GappingTab } from '../components/yardage/GappingTab';
import { HelpSheet } from '../components/help/HelpSheet';

const YardageBookHelpContent = lazy(() => import('../components/help/YardageBookHelpContent'));

const VIEWS = [
  { key: 'yardages', label: 'Yardages', to: '/yardage' },
  { key: 'wedge-matrix', label: 'Wedge Matrix', to: '/yardage/wedge-matrix' },
  { key: 'details', label: 'Details', to: '/yardage/details' },
  { key: 'gapping', label: 'Gapping Analysis', to: '/yardage/gapping' },
];

export function YardageBookPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);

  const activeKey = pathname.endsWith('/wedge-matrix')
    ? 'wedge-matrix'
    : pathname.endsWith('/details')
      ? 'details'
      : pathname.endsWith('/gapping')
        ? 'gapping'
        : 'yardages';

  return (
    <>
      <TopBar
        title="Yardage Book"
        showBack
        rightAction={
          <button onClick={() => setHelpOpen(true)} className="rounded-lg p-1.5 text-text-muted hover:text-text-dark" aria-label="How it works">
            <HelpCircle size={20} />
          </button>
        }
      />
      <div className="px-4 pt-3 pb-4">
        {/* View picker */}
        <div className="relative mb-4">
          <select
            value={activeKey}
            onChange={(e) => {
              const view = VIEWS.find((v) => v.key === e.target.value);
              if (view) navigate(view.to, { replace: true });
            }}
            className="w-full appearance-none rounded-xl border border-border bg-card px-4 py-2.5 pr-10 text-sm font-medium text-text-dark focus:border-fairway focus:outline-none focus:ring-1 focus:ring-fairway"
          >
            {VIEWS.map((v) => (
              <option key={v.key} value={v.key}>
                {v.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
        </div>

        {activeKey === 'yardages' && <YardagesTab />}
        {activeKey === 'wedge-matrix' && <WedgeMatrixTab />}
        {activeKey === 'details' && <DetailsTab />}
        {activeKey === 'gapping' && <GappingTab />}
      </div>

      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} title="How It Works">
        <Suspense fallback={<div className="py-8 text-center text-text-muted text-sm">Loading...</div>}>
          <YardageBookHelpContent />
        </Suspense>
      </HelpSheet>
    </>
  );
}
