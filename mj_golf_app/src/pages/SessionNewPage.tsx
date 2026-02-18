import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Camera, FileSpreadsheet, PenLine } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { useAllClubs } from '../hooks/useClubs';

export function SessionNewPage() {
  const navigate = useNavigate();
  const clubs = useAllClubs();
  const [clubId, setClubId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState('');

  if (clubs === undefined) return null;

  const clubOptions = clubs.map((c) => ({ value: c.id, label: c.name }));

  const selectedClub = clubId || (clubs.length > 0 ? clubs[0].id : '');

  const buildState = () => ({
    clubId: selectedClub,
    date: new Date(date).getTime(),
    location: location.trim() || undefined,
  });

  const methods = [
    {
      icon: Camera,
      label: 'Photo Capture',
      desc: 'Photograph GC4 screen',
      path: '/session/new/photo',
    },
    {
      icon: FileSpreadsheet,
      label: 'CSV Import',
      desc: 'Import from Foresight',
      path: '/session/new/csv',
    },
    {
      icon: PenLine,
      label: 'Manual Entry',
      desc: 'Enter shots by hand',
      path: '/session/new/manual',
    },
  ];

  return (
    <>
      <TopBar title="New Session" showBack />
      <div className="px-4 py-4">
        <div className="flex flex-col gap-4 mb-6">
          <Select
            label="Club"
            value={selectedClub}
            onChange={(e) => setClubId(e.target.value)}
            options={[{ value: '', label: 'Select a club...' }, ...clubOptions]}
          />
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Input
            label="Location (optional)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Claremont Range"
          />
        </div>

        <h3 className="mb-3 text-sm font-medium text-gray-400 uppercase">Add Data</h3>
        <div className="flex flex-col gap-2">
          {methods.map(({ icon: Icon, label, desc, path }) => (
            <button
              key={path}
              onClick={() => navigate(path, { state: buildState() })}
              disabled={!selectedClub}
              className="flex items-center gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4 text-left transition-colors hover:border-gray-700 disabled:opacity-40"
            >
              <div className="rounded-lg bg-gray-800 p-2.5">
                <Icon size={20} className="text-green-400" />
              </div>
              <div>
                <div className="font-medium text-white">{label}</div>
                <div className="text-xs text-gray-500">{desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
