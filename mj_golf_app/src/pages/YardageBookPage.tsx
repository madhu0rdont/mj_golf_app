import { useLocation } from 'react-router';
import { TopBar } from '../components/layout/TopBar';
import { TabBar } from '../components/ui/TabBar';
import { YardagesTab } from '../components/yardage/YardagesTab';
import { WedgeMatrixTab } from '../components/yardage/WedgeMatrixTab';
import { DetailsTab } from '../components/yardage/DetailsTab';
import { GappingTab } from '../components/yardage/GappingTab';

const TABS = [
  { key: 'yardages', label: 'Yardages', to: '/yardage' },
  { key: 'wedge-matrix', label: 'Wedge Matrix', to: '/yardage/wedge-matrix' },
  { key: 'details', label: 'Details', to: '/yardage/details' },
  { key: 'gapping', label: 'Gapping', to: '/yardage/gapping' },
];

export function YardageBookPage() {
  const { pathname } = useLocation();
  const activeTab = pathname.endsWith('/wedge-matrix')
    ? 'wedge-matrix'
    : pathname.endsWith('/details')
      ? 'details'
      : pathname.endsWith('/gapping')
        ? 'gapping'
        : 'yardages';

  return (
    <>
      <TopBar title="Yardage Book" showSettings />
      <TabBar tabs={TABS} activeTab={activeTab} />
      <div className="px-4 py-4">
        {activeTab === 'yardages' && <YardagesTab />}
        {activeTab === 'wedge-matrix' && <WedgeMatrixTab />}
        {activeTab === 'details' && <DetailsTab />}
        {activeTab === 'gapping' && <GappingTab />}
      </div>
    </>
  );
}
