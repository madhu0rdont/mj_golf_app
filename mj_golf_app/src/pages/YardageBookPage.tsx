import { useLocation, useNavigate } from 'react-router';
import { ChevronDown } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { YardagesTab } from '../components/yardage/YardagesTab';
import { WedgeMatrixTab } from '../components/yardage/WedgeMatrixTab';
import { DetailsTab } from '../components/yardage/DetailsTab';
import { GappingTab } from '../components/yardage/GappingTab';

const VIEWS = [
  { key: 'yardages', label: 'Yardages', to: '/yardage' },
  { key: 'wedge-matrix', label: 'Wedge Matrix', to: '/yardage/wedge-matrix' },
  { key: 'details', label: 'Details', to: '/yardage/details' },
  { key: 'gapping', label: 'Gapping Analysis', to: '/yardage/gapping' },
];

export function YardageBookPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const activeKey = pathname.endsWith('/wedge-matrix')
    ? 'wedge-matrix'
    : pathname.endsWith('/details')
      ? 'details'
      : pathname.endsWith('/gapping')
        ? 'gapping'
        : 'yardages';

  return (
    <>
      <TopBar title="Yardage Book" />
      <div className="px-4 pt-3 pb-4">
        {/* View picker */}
        <div className="relative mb-4">
          <select
            value={activeKey}
            onChange={(e) => {
              const view = VIEWS.find((v) => v.key === e.target.value);
              if (view) navigate(view.to, { replace: true });
            }}
            className="w-full appearance-none rounded-xl border border-border bg-card px-4 py-2.5 pr-10 text-sm font-medium text-text-dark focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
    </>
  );
}
