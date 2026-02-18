import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { FileSpreadsheet, Upload, AlertTriangle } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { ShotTable, type ShotRow } from '../components/sessions/ShotTable';
import { Button } from '../components/ui/Button';
import { parseCsvFile, readFileAsText, type CsvParseResult } from '../services/csv-parser';
import { createSession } from '../hooks/useSessions';

function parseNum(val: string | number | undefined): number | undefined {
  if (val == null || val === '') return undefined;
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return isNaN(n) ? undefined : n;
}

export function SessionCsvPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { clubId: string; date: number; location?: string } | null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null);
  const [shots, setShots] = useState<ShotRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!state?.clubId) {
    return (
      <>
        <TopBar title="CSV Import" showBack />
        <div className="px-4 py-8 text-center text-sm text-gray-500">
          No club selected. Go back and select a club first.
        </div>
      </>
    );
  }

  const handleFile = async (file: File) => {
    setError('');
    setFileName(file.name);
    try {
      const text = await readFileAsText(file);
      const result = parseCsvFile(text);

      if (result.rows.length === 0) {
        setError('No valid shot data found in CSV. Ensure the file has a "Carry" column.');
        return;
      }

      setParseResult(result);
      setShots(
        result.rows.map((r, i) => ({
          shotNumber: i + 1,
          carryYards: r.carryYards ?? '',
          totalYards: r.totalYards ?? '',
          ballSpeed: r.ballSpeed ?? '',
          clubHeadSpeed: r.clubHeadSpeed ?? '',
          launchAngle: r.launchAngle ?? '',
          spinRate: r.spinRate ?? '',
          spinAxis: r.spinAxis ?? '',
          apexHeight: r.apexHeight ?? '',
          offlineYards: r.offlineYards ?? '',
        }))
      );
    } catch {
      setError('Failed to read CSV file');
    }
  };

  const handleChange = (index: number, field: keyof ShotRow, value: string) => {
    setShots((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleDelete = (index: number) => {
    setShots((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      return updated.map((s, i) => ({ ...s, shotNumber: i + 1 }));
    });
  };

  const handleSave = async () => {
    const validShots = shots.filter((s) => {
      const carry = parseNum(s.carryYards);
      return carry != null && carry > 0;
    });

    if (validShots.length === 0) return;

    setSaving(true);
    try {
      const sessionId = await createSession({
        clubId: state.clubId,
        date: state.date,
        location: state.location,
        source: 'csv',
        shots: validShots.map((s, i) => ({
          shotNumber: i + 1,
          carryYards: parseNum(s.carryYards)!,
          totalYards: parseNum(s.totalYards),
          ballSpeed: parseNum(s.ballSpeed),
          clubHeadSpeed: parseNum(s.clubHeadSpeed),
          launchAngle: parseNum(s.launchAngle),
          spinRate: parseNum(s.spinRate),
          spinAxis: parseNum(s.spinAxis),
          apexHeight: parseNum(s.apexHeight),
          offlineYards: parseNum(s.offlineYards),
        })),
      });
      navigate(`/session/${sessionId}`, { replace: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TopBar title="CSV Import" showBack />
      <div className="px-4 py-4">
        {!parseResult ? (
          <>
            <p className="mb-4 text-sm text-gray-400">
              Upload a CSV file exported from Foresight FSX 2020 or the Foresight app.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-700 p-8 text-gray-400 transition-colors hover:border-green-600 hover:text-green-400"
            >
              <Upload size={32} />
              <span className="font-medium">Select CSV File</span>
              <span className="text-xs text-gray-600">.csv files from GC4/FSX exports</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="hidden"
            />
            {error && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">
                <AlertTriangle size={16} />
                {error}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-4 rounded-lg border border-gray-800 bg-gray-900 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <FileSpreadsheet size={16} className="text-green-400" />
                {fileName}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Found {shots.length} shot{shots.length !== 1 ? 's' : ''} &middot;
                Mapped {Object.keys(parseResult.mappings).length} of {parseResult.headers.length} columns
              </p>
              {parseResult.unmappedHeaders.length > 0 && (
                <p className="mt-1 text-xs text-amber-400">
                  Unmapped: {parseResult.unmappedHeaders.join(', ')}
                </p>
              )}
            </div>

            <p className="mb-3 text-xs text-gray-500">Review and edit the data below, then save.</p>

            <ShotTable shots={shots} onChange={handleChange} onDelete={handleDelete} />

            <div className="mt-4 flex flex-col gap-2">
              <Button onClick={handleSave} disabled={saving} size="lg" className="w-full">
                {saving ? 'Saving...' : `Save Session (${shots.length} shots)`}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setParseResult(null);
                  setShots([]);
                }}
              >
                Choose Different File
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
