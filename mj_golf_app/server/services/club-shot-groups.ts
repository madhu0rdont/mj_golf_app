import type { Club, Shot } from '../models/types.js';
import { buildKnownClubAvg, imputeClubMetrics, imputeFromCarryAndLoft, syntheticShot } from './impute.js';

const CLUB_COLORS = [
  '#E63946', '#F4A261', '#E9C46A', '#2A9D8F', '#4CC9F0',
  '#7209B7', '#F72585', '#4361EE', '#80ED99', '#FF6B6B',
];

export interface ClubShotGroup {
  clubId: string;
  clubName: string;
  color: string;
  shots: Shot[];
  imputed?: boolean;
}

export function computeClubShotGroups(clubs: Club[], allShots: Shot[]): ClubShotGroup[] {
  const shotsByClub = new Map<string, Shot[]>();
  for (const shot of allShots) {
    const list = shotsByClub.get(shot.clubId) || [];
    list.push(shot);
    shotsByClub.set(shot.clubId, list);
  }

  const shotBasedAvgs = clubs
    .map((club) => buildKnownClubAvg(club, shotsByClub.get(club.id) || []))
    .filter((a): a is NonNullable<typeof a> => a != null);

  const allKnownAvgs = [...shotBasedAvgs];
  for (const club of clubs) {
    const hasShots = (shotsByClub.get(club.id) || []).length > 0;
    if (!hasShots && club.loft && club.manualCarry) {
      const physics = imputeFromCarryAndLoft(club.manualCarry, club.loft);
      allKnownAvgs.push({
        loft: club.loft,
        carry: club.manualCarry,
        total: club.manualTotal ?? physics.total,
        ballSpeed: physics.ballSpeed,
        launchAngle: physics.launchAngle,
        spinRate: physics.spinRate,
        apexHeight: physics.apexHeight,
        descentAngle: physics.descentAngle,
      });
    }
  }

  const groups: ClubShotGroup[] = [];
  let colorIdx = 0;
  for (const club of clubs) {
    const shots = shotsByClub.get(club.id);
    if (shots && shots.length > 0) {
      groups.push({
        clubId: club.id,
        clubName: club.name,
        color: CLUB_COLORS[colorIdx % CLUB_COLORS.length],
        shots,
      });
      colorIdx++;
    } else if (club.category !== 'putter' && club.loft) {
      if (club.manualCarry) {
        const physics = imputeFromCarryAndLoft(club.manualCarry, club.loft);
        const metrics = { ...physics, carry: club.manualCarry, total: club.manualTotal ?? physics.total };
        groups.push({
          clubId: club.id,
          clubName: club.name,
          color: CLUB_COLORS[colorIdx % CLUB_COLORS.length],
          shots: [syntheticShot(club.id, metrics)],
          imputed: true,
        });
        colorIdx++;
      } else if (allKnownAvgs.length >= 2) {
        const metrics = imputeClubMetrics(allKnownAvgs, club.loft);
        if (metrics.carry > 0) {
          groups.push({
            clubId: club.id,
            clubName: club.name,
            color: CLUB_COLORS[colorIdx % CLUB_COLORS.length],
            shots: [syntheticShot(club.id, metrics)],
            imputed: true,
          });
          colorIdx++;
        }
      }
    }
  }

  return groups;
}
