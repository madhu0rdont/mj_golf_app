import { lazy, Suspense, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { PageHeader } from '../components/layout/PageHeader';
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
          <button onClick={() => setHelpOpen(true)} className="rounded-sm p-1.5 text-text-muted hover:text-text-dark" aria-label="How it works">
            <HelpCircle size={20} />
          </button>
        }
      />

      {/* Desktop page header */}
      <PageHeader
        eyebrow="Practice · GC4 Data"
        title="Yardage"
        titleEmphasis="Book"
        actions={
          <button
            onClick={() => setHelpOpen(true)}
            className="bg-forest text-linen border-none px-5 py-2.5 text-xs font-normal tracking-[0.05em] flex items-center gap-1.5 cursor-pointer hover:bg-turf transition-colors"
          >
            <HelpCircle size={14} />
            Help
          </button>
        }
      />

      {/* Filter bar */}
      <div className="px-4 md:px-8 pt-3 md:pt-4 pb-2 md:border-b md:border-card-border flex items-center gap-3 flex-wrap">
        <div className="relative flex-shrink-0">
          <select
            value={activeKey}
            onChange={(e) => {
              const view = VIEWS.find((v) => v.key === e.target.value);
              if (view) navigate(view.to, { replace: true });
            }}
            className="appearance-none bg-card backdrop-blur-[8px] border border-card-border px-4 py-2 pr-10 text-[13px] text-ink cursor-pointer focus:outline-none min-w-[160px]"
          >
            {VIEWS.map((v) => (
              <option key={v.key} value={v.key}>
                {v.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint"
          />
        </div>
      </div>

      <div className="px-4 md:px-0 pb-4">
        {activeKey === 'yardages' && <YardagesTab />}
        {activeKey === 'wedge-matrix' && <div className="md:px-8"><WedgeMatrixTab /></div>}
        {activeKey === 'details' && <DetailsTab />}
        {activeKey === 'gapping' && <div className="md:px-8"><GappingTab /></div>}
      </div>

      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} title="How It Works">
        <Suspense fallback={<div className="py-8 text-center text-text-muted text-sm">Loading...</div>}>
          <YardageBookHelpContent />
        </Suspense>
      </HelpSheet>
    </>
  );
}
