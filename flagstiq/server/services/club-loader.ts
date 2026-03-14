import { query } from '../db.js';
import type { Club, ClubCategory, ShotShape } from '../models/types.js';

interface BagClubRow {
  id: string;
  user_id: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  loft: number | null;
  shaft: string | null;
  flex: string | null;
  preferred_shape: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

interface ProfileRow {
  bag_club_id: string;
  profile_type: string;
  carry_mean: number | null;
  total_mean: number | null;
}

function assembleClub(club: BagClubRow, profiles: ProfileRow[]): Club {
  const manual = profiles.find(p => p.profile_type === 'manual');
  const computed = profiles.find(p => p.profile_type === 'computed');

  return {
    id: club.id,
    name: club.name,
    category: club.category as ClubCategory,
    brand: club.brand ?? undefined,
    model: club.model ?? undefined,
    loft: club.loft ?? undefined,
    shaft: club.shaft ?? undefined,
    flex: club.flex ?? undefined,
    manualCarry: manual?.carry_mean ?? null,
    manualTotal: manual?.total_mean ?? null,
    computedCarry: computed?.carry_mean ?? undefined,
    preferredShape: (club.preferred_shape as ShotShape) ?? null,
    sortOrder: club.sort_order,
    createdAt: club.created_at,
    updatedAt: club.updated_at,
  };
}

/**
 * Load all clubs for a user from bag_clubs + club_profiles,
 * returning the same Club[] shape used everywhere.
 */
export async function loadUserClubs(userId: string): Promise<Club[]> {
  const { rows: clubRows } = await query(
    'SELECT * FROM bag_clubs WHERE user_id = $1 ORDER BY sort_order',
    [userId],
  );

  if (clubRows.length === 0) return [];

  const clubIds = clubRows.map((r: BagClubRow) => r.id);

  const { rows: profileRows } = await query(
    'SELECT bag_club_id, profile_type, carry_mean, total_mean FROM club_profiles WHERE bag_club_id = ANY($1) AND is_current = true',
    [clubIds],
  );

  const profilesByClub = new Map<string, ProfileRow[]>();
  for (const row of profileRows as ProfileRow[]) {
    const list = profilesByClub.get(row.bag_club_id) || [];
    list.push(row);
    profilesByClub.set(row.bag_club_id, list);
  }

  return (clubRows as BagClubRow[]).map(club =>
    assembleClub(club, profilesByClub.get(club.id) || []),
  );
}

/**
 * Load a single club by ID for a user.
 */
export async function loadSingleClub(userId: string, clubId: string): Promise<Club | null> {
  const { rows: clubRows } = await query(
    'SELECT * FROM bag_clubs WHERE id = $1 AND user_id = $2',
    [clubId, userId],
  );

  if (clubRows.length === 0) return null;

  const club = clubRows[0] as BagClubRow;

  const { rows: profileRows } = await query(
    'SELECT bag_club_id, profile_type, carry_mean, total_mean FROM club_profiles WHERE bag_club_id = $1 AND is_current = true',
    [clubId],
  );

  return assembleClub(club, profileRows as ProfileRow[]);
}
