import { useState, useRef } from 'react';
import { Link } from 'react-router';
import { Download, Upload, Trash2, LogOut, Settings } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { exportAllData, importAllData, clearAllData } from '../db/backup';
import { api } from '../lib/api';

export function SettingsPage() {
  const { handedness, setHandedness } = useSettings();
  const { logout } = useAuth();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    try {
      await exportAllData();
    } catch (err) {
      alert('Export failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleImport = async (file: File) => {
    try {
      const result = await importAllData(file);
      setImportStatus(`Imported ${result.clubs} clubs, ${result.sessions} sessions, ${result.shots} shots`);
      window.location.reload();
    } catch (err) {
      setImportStatus('Import failed: ' + (err instanceof Error ? err.message : 'Invalid file'));
    }
  };

  const handleClear = async () => {
    await clearAllData();
    setShowClearConfirm(false);
    window.location.reload();
  };

  const handleResetBag = async () => {
    await clearAllData();
    await api.post('/seed', {});
    window.location.reload();
  };

  return (
    <>
      <TopBar title="Settings" showBack />
      <div className="px-4 py-4">
        {/* Handedness */}
        <section className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-text-medium uppercase">Handedness</h3>
          <p className="mb-3 text-xs text-text-muted">
            Affects how draw/fade and hook/slice are classified from spin data.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setHandedness('left')}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                handedness === 'left'
                  ? 'border-primary bg-primary-pale text-primary'
                  : 'border-border bg-card text-text-muted'
              }`}
            >
              Left-Handed
            </button>
            <button
              onClick={() => setHandedness('right')}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                handedness === 'right'
                  ? 'border-primary bg-primary-pale text-primary'
                  : 'border-border bg-card text-text-muted'
              }`}
            >
              Right-Handed
            </button>
          </div>
        </section>

        {/* Data Management */}
        <section className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-text-medium uppercase">Data Management</h3>
          <div className="flex flex-col gap-2">
            <Button variant="secondary" onClick={handleExport} className="w-full justify-start">
              <Download size={16} /> Export All Data (JSON)
            </Button>
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              className="w-full justify-start"
            >
              <Upload size={16} /> Import Data from Backup
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
              className="hidden"
            />
            {importStatus && (
              <p className="text-xs text-primary">{importStatus}</p>
            )}
          </div>
        </section>

        {/* Danger Zone */}
        <section className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-coral uppercase">Danger Zone</h3>
          <Button
            variant="danger"
            onClick={() => setShowClearConfirm(true)}
            className="w-full justify-start"
          >
            <Trash2 size={16} /> Clear All Data
          </Button>
        </section>

        {/* Log Out */}
        <section className="mb-6">
          <Button variant="secondary" onClick={logout} className="w-full justify-start">
            <LogOut size={16} /> Log Out
          </Button>
        </section>

        {/* About & Admin */}
        <section className="flex items-center justify-center gap-3">
          <Link to="/about" className="text-xs text-text-muted hover:text-primary transition">
            MJ Golf v1.0.0 &middot; About
          </Link>
          <Link
            to="/admin"
            className="flex items-center justify-center h-7 w-7 rounded-full bg-surface hover:bg-border transition"
            title="Admin Tools"
          >
            <Settings size={14} className="text-text-muted" />
          </Link>
        </section>
      </div>

      <Modal
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title="Clear All Data"
      >
        <p className="mb-4 text-sm text-text-medium">
          This will permanently delete all clubs, sessions, and shot data. This action cannot be
          undone. Consider exporting your data first.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="danger" onClick={handleClear} className="w-full">
            Delete Everything
          </Button>
          <Button variant="secondary" onClick={handleResetBag} className="w-full">
            Reset to Default Bag Only
          </Button>
          <Button variant="ghost" onClick={() => setShowClearConfirm(false)} className="w-full">
            Cancel
          </Button>
        </div>
      </Modal>
    </>
  );
}
