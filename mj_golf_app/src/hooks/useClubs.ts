import useSWR, { mutate } from 'swr';
import { fetcher } from '../lib/fetcher';
import { api } from '../lib/api';
import type { Club } from '../models/club';

export function useAllClubs() {
  const { data } = useSWR<Club[]>('/api/clubs', fetcher);
  return data;
}

export function useClub(id: string | undefined) {
  const { data } = useSWR<Club>(id ? `/api/clubs/${id}` : null, fetcher);
  return data;
}

export function useClubsByCategory() {
  const clubs = useAllClubs();
  if (!clubs) return undefined;
  const grouped: Record<string, Club[]> = {};
  for (const club of clubs) {
    if (!grouped[club.category]) grouped[club.category] = [];
    grouped[club.category].push(club);
  }
  return grouped;
}

export async function addClub(data: Omit<Club, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'>) {
  const club = await api.post<Club>('/clubs', data);
  await mutate('/api/clubs');
  return club.id;
}

export async function updateClub(id: string, data: Partial<Club>) {
  await api.put(`/clubs/${id}`, data);
  await mutate('/api/clubs');
  await mutate(`/api/clubs/${id}`);
}

export async function deleteClub(id: string) {
  await api.delete(`/clubs/${id}`);
  await mutate('/api/clubs');
}

export async function reorderClubs(orderedIds: string[]) {
  await api.put('/clubs/reorder', { orderedIds });
  await mutate('/api/clubs');
}
