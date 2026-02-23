import { mutate } from 'swr';
import { api } from '../lib/api';

interface BackupData {
  version: number;
  exportedAt: string;
  clubs: unknown[];
  sessions: unknown[];
  shots: unknown[];
}

export async function exportAllData(): Promise<void> {
  const backup = await api.get<BackupData>('/backup/export');

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mj-golf-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importAllData(file: File): Promise<{ clubs: number; sessions: number; shots: number }> {
  const text = await file.text();
  const data: BackupData = JSON.parse(text);

  if (!data.version || !Array.isArray(data.clubs)) {
    throw new Error('Invalid backup file format');
  }

  const result = await api.post<{ clubs: number; sessions: number; shots: number }>(
    '/backup/import',
    data
  );

  // Revalidate all SWR caches
  await mutate(() => true, undefined, { revalidate: true });

  return result;
}

export async function clearAllData(): Promise<void> {
  // Import with empty arrays to clear
  await api.post('/backup/import', { version: 1, clubs: [], sessions: [], shots: [] });
  await mutate(() => true, undefined, { revalidate: true });
}
