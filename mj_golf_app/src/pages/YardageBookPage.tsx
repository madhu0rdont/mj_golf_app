import { useState } from 'react';
import { Link } from 'react-router';
import { BarChart3 } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { TabBar } from '../components/ui/TabBar';
import { YardagesTab } from '../components/yardage/YardagesTab';
import { WedgeMatrixTab } from '../components/yardage/WedgeMatrixTab';
import { DetailsTab } from '../components/yardage/DetailsTab';

const TABS = [
  { key: 'yardages', label: 'Yardages' },
  { key: 'wedge-matrix', label: 'Wedge Matrix' },
  { key: 'details', label: 'Details' },
];

export function YardageBookPage() {
  const [activeTab, setActiveTab] = useState('yardages');

  return (
    <>
      <TopBar
        title="Yardage Book"
        showSettings
        rightAction={
          activeTab === 'details' ? (
            <Link to="/yardage/gapping" className="rounded-lg p-1.5 text-text-muted hover:text-text-dark">
              <BarChart3 size={20} />
            </Link>
          ) : undefined
        }
      />
      <TabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      <div className="px-4 py-4">
        {activeTab === 'yardages' && <YardagesTab />}
        {activeTab === 'wedge-matrix' && <WedgeMatrixTab />}
        {activeTab === 'details' && <DetailsTab />}
      </div>
    </>
  );
}
