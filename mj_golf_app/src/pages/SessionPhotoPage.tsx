import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Loader2, AlertCircle } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { PhotoCapture } from '../components/sessions/PhotoCapture';
import { ExtractionPreview } from '../components/sessions/ExtractionPreview';
import { Button } from '../components/ui/Button';
import { type ShotRow } from '../components/sessions/ShotTable';
import { extractShotDataFromImage, imageFileToBase64, type ExtractedShot } from '../services/claude-vision';
import { createSession } from '../hooks/useSessions';
import { useSettings } from '../context/SettingsContext';

type Step = 'capture' | 'extracting' | 'preview' | 'error';

function toShotRows(shots: ExtractedShot[]): ShotRow[] {
  return shots.map((s) => ({
    shotNumber: s.shotNumber,
    carryYards: s.carryYards ?? '',
    totalYards: s.totalYards ?? '',
    ballSpeed: s.ballSpeed ?? '',
    clubHeadSpeed: s.clubHeadSpeed ?? '',
    launchAngle: s.launchAngle ?? '',
    spinRate: s.spinRate ?? '',
    spinAxis: s.spinAxis ?? '',
    apexHeight: s.apexHeight ?? '',
    offlineYards: s.offlineYards ?? '',
    pushPull: s.pushPull ?? '',
    sideSpinRate: s.sideSpinRate ?? '',
    descentAngle: s.descentAngle ?? '',
  }));
}

function parseNum(val: string | number | undefined): number | undefined {
  if (val == null || val === '') return undefined;
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return isNaN(n) ? undefined : n;
}

export function SessionPhotoPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { apiKey, handedness } = useSettings();
  const state = location.state as { clubId: string; date: number; location?: string } | null;

  const [step, setStep] = useState<Step>('capture');
  const [shots, setShots] = useState<ShotRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  if (!state?.clubId) {
    return (
      <>
        <TopBar title="Photo Capture" showBack />
        <div className="px-4 py-8 text-center text-sm text-text-muted">
          No club selected. Go back and select a club first.
        </div>
      </>
    );
  }

  if (!apiKey) {
    return (
      <>
        <TopBar title="Photo Capture" showBack />
        <div className="px-4 py-8 text-center">
          <AlertCircle size={40} className="mx-auto mb-3 text-amber-400" />
          <p className="mb-2 font-medium">API Key Required</p>
          <p className="mb-4 text-sm text-text-medium">
            Set your Claude API key in Settings to use photo extraction.
          </p>
          <Button onClick={() => navigate('/settings')}>Go to Settings</Button>
        </div>
      </>
    );
  }

  const handleCapture = async (file: File) => {
    setCurrentFile(file);
    setStep('extracting');
    setErrorMsg('');
    try {
      const { base64, mediaType } = await imageFileToBase64(file);
      const result = await extractShotDataFromImage(base64, mediaType, apiKey);
      setShots(toShotRows(result.shots));
      setWarnings(result.warnings);
      setStep('preview');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Extraction failed');
      setStep('error');
    }
  };

  const handleRetry = () => {
    if (currentFile) {
      handleCapture(currentFile);
    } else {
      setStep('capture');
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

  const handleConfirm = async (confirmedShots: ShotRow[]) => {
    const validShots = confirmedShots.filter((s) => {
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
        source: 'photo',
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
          pushPull: parseNum(s.pushPull),
          sideSpinRate: parseNum(s.sideSpinRate),
          descentAngle: parseNum(s.descentAngle),
        })),
      }, handedness);
      navigate(`/session/${sessionId}`, { replace: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TopBar title="Photo Capture" showBack />
      <div className="px-4 py-4">
        {step === 'capture' && <PhotoCapture onCapture={handleCapture} />}

        {step === 'extracting' && (
          <div className="flex flex-col items-center gap-4 py-16">
            <Loader2 size={40} className="animate-spin text-primary" />
            <p className="font-medium">Analyzing image...</p>
            <p className="text-sm text-text-muted">This usually takes 5-10 seconds</p>
          </div>
        )}

        {step === 'preview' && (
          <ExtractionPreview
            shots={shots}
            warnings={warnings}
            onConfirm={handleConfirm}
            onRetry={handleRetry}
            onManualFallback={() =>
              navigate('/session/new/manual', { state })
            }
            onChange={handleChange}
            onDelete={handleDelete}
          />
        )}

        {step === 'error' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <AlertCircle size={40} className="text-coral" />
            <p className="font-medium">Extraction Failed</p>
            <p className="max-w-xs text-center text-sm text-text-medium">{errorMsg}</p>
            <div className="flex gap-3">
              <Button onClick={handleRetry}>Try Again</Button>
              <Button
                variant="secondary"
                onClick={() => navigate('/session/new/manual', { state })}
              >
                Manual Entry
              </Button>
            </div>
          </div>
        )}

        {saving && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="flex items-center gap-3 rounded-xl bg-card px-6 py-4">
              <Loader2 size={20} className="animate-spin text-primary" />
              <span>Saving session...</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
