import { useState, useRef, useCallback } from 'react';
import { Download, Upload, LogOut, Loader2, Camera, X } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { Button } from '../components/ui/Button';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useCourses } from '../hooks/useCourses';
import { exportAllData, importAllData } from '../db/backup';
import { api } from '../lib/api';

const COURSE_LOGOS: Record<string, string> = {
  claremont: '/course-logos/claremont.svg',
  presidio: '/course-logos/presidio.webp',
  tilden: '/course-logos/tilden.webp',
  tcc: '/course-logos/tcc.svg',
  harding: '/course-logos/harding.webp',
  meadow: '/course-logos/meadow-club.webp',
  blackhawk: '/course-logos/blackhawk.png',
};

function getCourseLogoKey(name: string): string | undefined {
  const lower = name.toLowerCase();
  return Object.keys(COURSE_LOGOS).find((key) => lower.includes(key));
}

/** Resize an image file to maxSize x maxSize, return base64 data URL */
function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      // Crop to square from center, then resize
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      canvas.width = maxSize;
      canvas.height = maxSize;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, maxSize, maxSize);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

export function SettingsPage() {
  const { handedness, setHandedness } = useSettings();
  const { user, logout, updateUser } = useAuth();
  const { courses } = useCourses();
  const [importStatus, setImportStatus] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pictureInputRef = useRef<HTMLInputElement>(null);

  // Profile editing state
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [homeCourseId, setHomeCourseId] = useState(user?.homeCourseId || '');
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState('');

  const hasProfileChanges =
    displayName !== (user?.displayName || '') ||
    email !== (user?.email || '') ||
    homeCourseId !== (user?.homeCourseId || '') ||
    profilePreview !== null;

  const handlePictureSelect = useCallback(async (file: File) => {
    try {
      const dataUrl = await resizeImage(file, 128);
      setProfilePreview(dataUrl);
    } catch {
      setProfileStatus('Failed to process image');
    }
  }, []);

  const handleRemovePicture = useCallback(() => {
    setProfilePreview('remove');
  }, []);

  const handleSaveProfile = useCallback(async () => {
    setSaving(true);
    setProfileStatus('');
    try {
      const body: Record<string, unknown> = {};
      if (displayName !== (user?.displayName || '')) body.displayName = displayName;
      if (email !== (user?.email || '')) body.email = email || null;
      if (homeCourseId !== (user?.homeCourseId || '')) body.homeCourseId = homeCourseId || null;
      if (profilePreview === 'remove') {
        body.profilePicture = null;
      } else if (profilePreview) {
        body.profilePicture = profilePreview;
      }

      const result = await api.put<{
        id: string;
        username: string;
        displayName: string;
        email?: string;
        profilePicture?: string;
        role: 'admin' | 'player';
        handedness: 'left' | 'right';
        homeCourseId?: string;
      }>('/users/me', body);
      updateUser(result);
      setProfilePreview(null);
      setProfileStatus('Saved');
      setTimeout(() => setProfileStatus(''), 2000);
    } catch (err) {
      setProfileStatus(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [displayName, email, homeCourseId, profilePreview, user, updateUser]);

  const handleExport = async () => {
    try {
      await exportAllData();
    } catch (err) {
      alert('Export failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportStatus('');
    try {
      const result = await importAllData(file);
      setImportStatus(`Imported ${result.clubs} clubs, ${result.sessions} sessions, ${result.shots} shots`);
      window.location.reload();
    } catch (err) {
      setImportStatus('Import failed: ' + (err instanceof Error ? err.message : 'Invalid file'));
      setImporting(false);
    }
  };

  // Determine which picture to show
  const currentPicture =
    profilePreview === 'remove'
      ? null
      : profilePreview || user?.profilePicture || null;
  const initials = (user?.displayName || user?.username || '?').slice(0, 2).toUpperCase();

  return (
    <>
      <TopBar title="Settings" showBack />
      <div className="px-4 py-4">
        {/* Profile */}
        <section className="mb-6">
          <h3 className="mb-3 font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand">Profile</h3>
          <div className="flex flex-col items-center gap-3 mb-4">
            <div className="relative">
              <button
                onClick={() => pictureInputRef.current?.click()}
                className="relative flex h-20 w-20 items-center justify-center rounded-full bg-forest font-mono text-xl font-medium tracking-wide text-white overflow-hidden ring-2 ring-border hover:ring-fairway transition-all"
              >
                {currentPicture ? (
                  <img src={currentPicture} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
                  <Camera size={20} className="text-white" />
                </div>
              </button>
              {currentPicture && (
                <button
                  onClick={handleRemovePicture}
                  className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-coral text-white shadow-sm hover:bg-coral/80 transition-colors"
                  title="Remove picture"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <input
              ref={pictureInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handlePictureSelect(e.target.files[0])}
              className="hidden"
            />
            <p className="text-xs text-text-muted">Tap to change photo</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-medium">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={user?.username}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-dark outline-none focus:border-fairway focus:ring-1 focus:ring-fairway"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-dark outline-none focus:border-fairway focus:ring-1 focus:ring-fairway"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-medium">Home Course</label>
              <div className="flex items-center gap-2">
                {(() => {
                  const selected = courses?.find(c => c.id === homeCourseId);
                  const logoKey = selected ? getCourseLogoKey(selected.name) : undefined;
                  const logoUrl = logoKey ? COURSE_LOGOS[logoKey] : null;
                  return logoUrl ? (
                    <img src={logoUrl} alt="" className="h-6 w-6 rounded object-contain flex-shrink-0" />
                  ) : null;
                })()}
                <select
                  value={homeCourseId}
                  onChange={(e) => setHomeCourseId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-dark outline-none focus:border-fairway focus:ring-1 focus:ring-fairway"
                >
                  <option value="">None</option>
                  {courses?.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {hasProfileChanges && (
            <Button
              onClick={handleSaveProfile}
              disabled={saving}
              className="mt-3 w-full"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {saving ? 'Saving...' : 'Save Profile'}
            </Button>
          )}
          {profileStatus && (
            <p className={`mt-2 text-xs ${profileStatus === 'Saved' ? 'text-primary' : 'text-coral'}`}>
              {profileStatus}
            </p>
          )}
        </section>

        {/* Handedness */}
        <section className="mb-6">
          <h3 className="mb-2 font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand">Handedness</h3>
          <p className="mb-3 text-xs text-text-muted">
            Affects how draw/fade and hook/slice are classified from spin data.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setHandedness('left')}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                handedness === 'left'
                  ? 'border-turf bg-parchment text-turf'
                  : 'border-border bg-card text-text-muted'
              }`}
            >
              Left-Handed
            </button>
            <button
              onClick={() => setHandedness('right')}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                handedness === 'right'
                  ? 'border-turf bg-parchment text-turf'
                  : 'border-border bg-card text-text-muted'
              }`}
            >
              Right-Handed
            </button>
          </div>
        </section>

        {/* Data Management */}
        <section className="mb-6">
          <h3 className="mb-2 font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand">Data Management</h3>
          <div className="flex flex-col gap-2">
            <Button variant="secondary" onClick={handleExport} className="w-full justify-start">
              <Download size={16} /> Export All Data (JSON)
            </Button>
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              className="w-full justify-start"
              disabled={importing}
            >
              {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {importing ? 'Importing...' : 'Import Data from Backup'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
              className="hidden"
            />
            {importStatus && (
              <p className={`text-xs ${importStatus.startsWith('Import failed') ? 'text-coral' : 'text-primary'}`}>{importStatus}</p>
            )}
          </div>
        </section>

        {/* Log Out */}
        <section className="mb-6">
          <Button variant="secondary" onClick={logout} className="w-full justify-start">
            <LogOut size={16} /> Log Out
          </Button>
        </section>

        {/* About */}
        <section className="flex items-center justify-center gap-3">
          <span className="text-xs text-text-muted">MJ Golf v{__APP_VERSION__}</span>
        </section>
      </div>

    </>
  );
}
