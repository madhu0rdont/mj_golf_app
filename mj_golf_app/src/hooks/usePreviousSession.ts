import { useMemo } from 'react';
import useSWR from 'swr';
import { fetcher } from '../lib/fetcher';
import { computeSessionSummary } from '../services/stats';
import type { Session, Shot, SessionSummary } from '../models/session';

interface PreviousSessionResponse {
  session: Session;
  shots: Shot[];
  clubName: string;
}

export function usePreviousSessionSummary(
  clubId: string | undefined,
  currentSessionDate: number | undefined
): SessionSummary | null | undefined {
  const { data } = useSWR<PreviousSessionResponse | null>(
    clubId && currentSessionDate
      ? `/api/yardage/${clubId}/previous?before=${currentSessionDate}`
      : null,
    fetcher
  );

  return useMemo(() => {
    if (data === undefined) return undefined;
    if (data === null || !data.shots || data.shots.length === 0) return null;

    return computeSessionSummary(
      data.shots,
      data.clubName,
      data.session.id,
      data.session.clubId ?? '',
      data.session.date
    );
  }, [data]);
}
