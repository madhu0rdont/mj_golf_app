import { db } from './index';

interface BackupData {
  version: number;
  exportedAt: string;
  clubs: unknown[];
  sessions: unknown[];
  shots: unknown[];
}

export async function exportAllData(): Promise<void> {
  const clubs = await db.clubs.toArray();
  const sessions = await db.sessions.toArray();
  const shots = await db.shots.toArray();

  const backup: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    clubs,
    sessions,
    shots,
  };

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

  await db.transaction('rw', db.clubs, db.sessions, db.shots, async () => {
    await db.clubs.clear();
    await db.sessions.clear();
    await db.shots.clear();

    if (data.clubs.length > 0) await db.clubs.bulkAdd(data.clubs as never[]);
    if (data.sessions.length > 0) await db.sessions.bulkAdd(data.sessions as never[]);
    if (data.shots.length > 0) await db.shots.bulkAdd(data.shots as never[]);
  });

  return {
    clubs: data.clubs.length,
    sessions: data.sessions.length,
    shots: data.shots.length,
  };
}

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.clubs, db.sessions, db.shots, async () => {
    await db.clubs.clear();
    await db.sessions.clear();
    await db.shots.clear();
  });
}
