import { useState, useRef, type DragEvent } from 'react';
import { Upload, Check, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { ParsedCourse, CourseWithHoles } from '../../models/course';

interface KmlImporterProps {
  onComplete: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS = ['Upload', 'Preview', 'Details', 'Elevation', 'Done'];

const DEFAULT_TEE_BOXES = ['blue', 'white', 'red'];

export function KmlImporter({ onComplete }: KmlImporterProps) {
  const [step, setStep] = useState<Step>(1);
  const [parsedData, setParsedData] = useState<ParsedCourse | null>(null);
  const [courseMeta, setCourseMeta] = useState({
    name: '',
    par: '',
    slope: '',
    rating: '',
    designers: '',
  });
  const [scorecard, setScorecard] = useState<Record<number, Record<string, number>>>({});
  const [result, setResult] = useState<CourseWithHoles | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Step 1: File Upload ---

  async function handleFile(file: File) {
    if (!file.name.endsWith('.kml')) {
      setError('Please upload a .kml file');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/admin/import-kml', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(body.error || `Upload failed (${res.status})`);
      }
      const parsed: ParsedCourse = await res.json();
      setParsedData(parsed);

      // Pre-fill scorecard from KML yardages (first tee box column)
      const initial: Record<number, Record<string, number>> = {};
      for (const h of parsed.holes) {
        initial[h.holeNumber] = { blue: h.yardage };
      }
      setScorecard(initial);

      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  // --- Step 3: Scorecard ---

  function updateScorecard(hole: number, teeBox: string, value: string) {
    const yards = parseInt(value);
    setScorecard((prev) => ({
      ...prev,
      [hole]: {
        ...prev[hole],
        [teeBox]: isNaN(yards) ? 0 : yards,
      },
    }));
  }

  // --- Step 4: Confirm & Enrich ---

  async function handleConfirm() {
    if (!parsedData || !courseMeta.name) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/import-kml/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course: {
            name: courseMeta.name,
            par: courseMeta.par ? parseInt(courseMeta.par) : undefined,
            slope: courseMeta.slope ? parseInt(courseMeta.slope) : undefined,
            rating: courseMeta.rating ? parseFloat(courseMeta.rating) : undefined,
            designers: courseMeta.designers
              ? courseMeta.designers.split(',').map((d) => d.trim()).filter(Boolean)
              : undefined,
          },
          scorecard,
          holes: parsedData.holes,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Import failed' }));
        throw new Error(body.error || `Import failed (${res.status})`);
      }

      const created: CourseWithHoles = await res.json();
      setResult(created);
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  // --- Render ---

  return (
    <div className="flex flex-col gap-4">
      {/* Step indicator */}
      <div className="flex items-center gap-1 text-xs text-text-muted">
        {STEP_LABELS.map((label, i) => (
          <span key={label} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} />}
            <span
              className={
                i + 1 === step
                  ? 'font-semibold text-primary'
                  : i + 1 < step
                    ? 'text-text-medium'
                    : ''
              }
            >
              {label}
            </span>
          </span>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
          {error}
        </div>
      )}

      {/* Step 1: File Upload */}
      {step === 1 && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
            dragOver
              ? 'border-primary bg-primary-pale'
              : 'border-border hover:border-primary/50'
          }`}
        >
          {loading ? (
            <Loader2 size={32} className="animate-spin text-primary" />
          ) : (
            <>
              <Upload size={32} className="text-text-muted" />
              <p className="text-sm text-text-medium">
                Drag & drop a <strong>.kml</strong> file or click to browse
              </p>
              <p className="text-xs text-text-muted">ProVisualizer KML export</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".kml"
            onChange={onFileInput}
            hidden
          />
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 2 && parsedData && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-text-dark">
            KML Preview — {parsedData.holes.length} Holes
          </h3>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-text-muted">
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">Par</th>
                  <th className="px-2 py-1.5">Yds</th>
                  <th className="px-2 py-1.5">Tee</th>
                  <th className="px-2 py-1.5">Pin</th>
                  <th className="px-2 py-1.5">Tgts</th>
                  <th className="px-2 py-1.5">CL Pts</th>
                </tr>
              </thead>
              <tbody>
                {parsedData.holes.map((h) => (
                  <tr key={h.holeNumber} className="border-b border-border/50">
                    <td className="px-2 py-1.5 font-medium">{h.holeNumber}</td>
                    <td className="px-2 py-1.5">{h.par}</td>
                    <td className="px-2 py-1.5">{h.yardage}</td>
                    <td className="px-2 py-1.5 font-mono text-[10px]">
                      {h.tee.lat.toFixed(4)}, {h.tee.lng.toFixed(4)}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[10px]">
                      {h.pin.lat.toFixed(4)}, {h.pin.lng.toFixed(4)}
                    </td>
                    <td className="px-2 py-1.5 text-center">{h.targets.length}</td>
                    <td className="px-2 py-1.5 text-center">{h.centerLine.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Re-upload
            </Button>
            <Button onClick={() => setStep(3)} className="flex-1">
              Looks Good
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Course Metadata + Scorecard */}
      {step === 3 && parsedData && (
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-text-dark">Course Details</h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Input
                label="Course Name"
                value={courseMeta.name}
                onChange={(e) =>
                  setCourseMeta((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="Claremont Country Club"
              />
            </div>
            <Input
              label="Par"
              type="number"
              value={courseMeta.par}
              onChange={(e) =>
                setCourseMeta((p) => ({ ...p, par: e.target.value }))
              }
              placeholder="68"
            />
            <Input
              label="Slope"
              type="number"
              value={courseMeta.slope}
              onChange={(e) =>
                setCourseMeta((p) => ({ ...p, slope: e.target.value }))
              }
              placeholder="123"
            />
            <Input
              label="Rating"
              value={courseMeta.rating}
              onChange={(e) =>
                setCourseMeta((p) => ({ ...p, rating: e.target.value }))
              }
              placeholder="68.1"
            />
            <Input
              label="Designers"
              value={courseMeta.designers}
              onChange={(e) =>
                setCourseMeta((p) => ({ ...p, designers: e.target.value }))
              }
              placeholder="Alister MacKenzie, Tom Doak"
            />
          </div>

          <h3 className="text-sm font-semibold text-text-dark">Scorecard Yardages</h3>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-text-muted">
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">Par</th>
                  {DEFAULT_TEE_BOXES.map((tee) => (
                    <th key={tee} className="px-2 py-1.5 capitalize">
                      {tee}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedData.holes.map((h) => (
                  <tr key={h.holeNumber} className="border-b border-border/50">
                    <td className="px-2 py-1.5 font-medium">{h.holeNumber}</td>
                    <td className="px-2 py-1.5">{h.par}</td>
                    {DEFAULT_TEE_BOXES.map((tee) => (
                      <td key={tee} className="px-1 py-0.5">
                        <input
                          type="number"
                          value={scorecard[h.holeNumber]?.[tee] ?? ''}
                          onChange={(e) =>
                            updateScorecard(h.holeNumber, tee, e.target.value)
                          }
                          className="w-16 rounded border border-border bg-card px-1.5 py-1 text-xs text-text-dark focus:border-primary focus:outline-none"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button
              onClick={() => setStep(4)}
              disabled={!courseMeta.name}
              className="flex-1"
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Elevation Enrichment */}
      {step === 4 && (
        <div className="flex flex-col items-center gap-4 py-6">
          {loading ? (
            <>
              <Loader2 size={32} className="animate-spin text-primary" />
              <p className="text-sm text-text-medium">
                Fetching elevation data from Google...
              </p>
              <p className="text-xs text-text-muted">
                This may take a moment for all coordinates
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-text-medium text-center">
                Ready to enrich <strong>{courseMeta.name}</strong> with elevation
                data and compute plays-like yardages.
              </p>
              <Button onClick={handleConfirm} size="lg">
                Enrich with Elevation
              </Button>
              <Button variant="ghost" onClick={() => setStep(3)}>
                Back to Details
              </Button>
            </>
          )}
        </div>
      )}

      {/* Step 5: Success */}
      {step === 5 && result && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-primary">
            <Check size={20} />
            <h3 className="text-sm font-semibold">
              {result.name} — {result.holes.length} holes imported
            </h3>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-text-muted">
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">Par</th>
                  <th className="px-2 py-1.5">Yards</th>
                  <th className="px-2 py-1.5">Elev Δ</th>
                  <th className="px-2 py-1.5">Plays Like</th>
                </tr>
              </thead>
              <tbody>
                {result.holes.map((h) => {
                  const elevDelta = h.pin.elevation - h.tee.elevation;
                  const elevDeltaFt = Math.round(elevDelta * 3.281);
                  const firstTee = Object.keys(h.yardages)[0];
                  const yards = firstTee ? h.yardages[firstTee] : null;
                  const plYards =
                    firstTee && h.playsLikeYards
                      ? h.playsLikeYards[firstTee]
                      : null;

                  return (
                    <tr key={h.holeNumber} className="border-b border-border/50">
                      <td className="px-2 py-1.5 font-medium">{h.holeNumber}</td>
                      <td className="px-2 py-1.5">{h.par}</td>
                      <td className="px-2 py-1.5">{yards}</td>
                      <td
                        className={`px-2 py-1.5 ${
                          elevDeltaFt > 0
                            ? 'text-coral'
                            : elevDeltaFt < 0
                              ? 'text-primary'
                              : ''
                        }`}
                      >
                        {elevDeltaFt > 0 ? '+' : ''}
                        {elevDeltaFt} ft
                      </td>
                      <td className="px-2 py-1.5 font-medium">{plYards}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Button onClick={onComplete} className="w-full">
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
