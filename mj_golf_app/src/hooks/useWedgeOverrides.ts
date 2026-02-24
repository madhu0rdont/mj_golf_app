import useSWR, { mutate } from 'swr';
import { fetcher } from '../lib/fetcher';
import { api } from '../lib/api';

export interface WedgeOverride {
  clubId: string;
  position: string;
  carry: number;
}

export function useWedgeOverrides() {
  const { data } = useSWR<WedgeOverride[]>('/api/wedge-overrides', fetcher);
  return data;
}

export async function setWedgeOverride(clubId: string, position: string, carry: number) {
  await api.put('/wedge-overrides', { clubId, position, carry });
  await mutate('/api/wedge-overrides');
}

export async function removeWedgeOverride(clubId: string, position: string) {
  await api.delete(`/wedge-overrides/${clubId}/${position}`);
  await mutate('/api/wedge-overrides');
}
