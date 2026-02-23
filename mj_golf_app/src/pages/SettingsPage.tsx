import { useState, useRef } from 'react';
import { Download, Upload, Trash2, Eye, EyeOff } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useSettings } from '../context/SettingsContext';
import { exportAllData, importAllData, clearAllData } from '../db/backup';
import { seedFromBackup } from '../db/seed';

export function SettingsPage() {
  const { apiKey, setApiKey, handedness, setHandedness } = useSettings();
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState(apiKey);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveKey = () => {
    setApiKey(keyInput.trim());
  };

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
    } catch (err) {
      setImportStatus('Import failed: ' + (err instanceof Error ? err.message : 'Invalid file'));
    }
  };

  const handleClear = async () => {
    await clearAllData();
    setShowClearConfirm(false);
  };

  const handleResetBag = async () => {
    await clearAllData();
    await seedFromBackup();
    setShowClearConfirm(false);
  };

  return (
    <>
      <TopBar title="Settings" showBack />
      <div className="px-4 py-4">
        {/* API Key */}
        <section className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-text-medium uppercase">Claude API Key</h3>
          <p className="mb-3 text-xs text-text-muted">
            Required for photo extraction. Your key is stored locally and never sent anywhere except
            the Anthropic API.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full rounded-lg border border-border bg-card px-3 py-2 pr-10 text-sm text-text-dark placeholder-text-muted focus:border-primary focus:outline-none"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-dark"
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <Button onClick={handleSaveKey} size="sm" disabled={keyInput.trim() === apiKey}>
              Save
            </Button>
          </div>
        </section>

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

        {/* About */}
        <section className="text-center text-xs text-text-muted">
          <p>MJ Golf v1.0.0</p>
          <p>Club Distances & Yardage Book for Foresight GC4</p>
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
