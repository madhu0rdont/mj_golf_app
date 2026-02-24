import useSWR, { mutate } from 'swr';
import { fetcher } from '../lib/fetcher';
import { api } from '../lib/api';
import type { Session, Shot, IngestionMethod, SessionType, SwingPosition, InterleavedMetadata } from '../models/session';

export function useSessionsForClub(clubId: string | undefined) {
  const { data } = useSWR<Session[]>(
    clubId ? `/api/sessions?clubId=${clubId}` : null,
    fetcher
  );
  return data;
}

export function useRecentSessions(limit: number = 10) {
  const { data } = useSWR<Session[]>(`/api/sessions?limit=${limit}`, fetcher);
  return data;
}

export function useAllSessions() {
  const { data } = useSWR<Session[]>('/api/sessions?all=true', fetcher);
  return data;
}

export function useSession(id: string | undefined) {
  const { data } = useSWR<Session>(id ? `/api/sessions/${id}` : null, fetcher);
  return data;
}

export function useShotsForSession(sessionId: string | undefined) {
  const { data } = useSWR<Shot[]>(
    sessionId ? `/api/sessions/${sessionId}/shots` : null,
    fetcher
  );
  return data;
}

export interface CreateSessionInput {
  clubId?: string | null;
  type?: SessionType;
  date: number;
  location?: string;
  notes?: string;
  source: IngestionMethod;
  metadata?: InterleavedMetadata;
  shots: (Omit<Shot, 'id' | 'sessionId' | 'clubId' | 'shape' | 'quality' | 'timestamp'> & {
    clubId?: string;
    position?: SwingPosition;
    holeNumber?: number;
  })[];
}

export async function createSession(input: CreateSessionInput): Promise<string> {
  const result = await api.post<{ id: string }>('/sessions', input);
  await revalidateSessions();
  return result.id;
}

export async function updateSession(
  id: string,
  updates: { clubId?: string; date?: number }
): Promise<void> {
  await api.put(`/sessions/${id}`, updates);
  await revalidateSessions();
}

export async function deleteSession(id: string): Promise<void> {
  await api.delete(`/sessions/${id}`);
  await revalidateSessions();
}

async function revalidateSessions() {
  // Revalidate all session-related SWR keys
  await mutate((key: string) => typeof key === 'string' && key.startsWith('/api/sessions'), undefined, { revalidate: true });
}
