import type { YardageBookEntry } from '../models/yardage';
import type { ConfidenceLevel, ClubRecommendation } from '../models/course';

export function getClubRecommendations(
  targetYardage: number,
  entries: YardageBookEntry[]
): ClubRecommendation[] {
  if (entries.length === 0 || targetYardage <= 0) return [];

  const recommendations: ClubRecommendation[] = entries
    .filter((e) => e.bookCarry > 0 && e.category !== 'putter')
    .map((e) => {
      const delta = e.bookCarry - targetYardage;
      const absDelta = Math.abs(delta);

      let confidence: ConfidenceLevel;
      if (absDelta <= 5 && e.freshness === 'fresh' && e.dispersion < 15) {
        confidence = 'great';
      } else if (absDelta <= 10) {
        confidence = 'ok';
      } else if (absDelta <= 20) {
        confidence = 'stretch';
      } else {
        confidence = 'stretch';
      }

      // Downgrade if stale or high dispersion
      if (e.freshness === 'stale' && confidence === 'great') confidence = 'ok';
      if (e.dispersion > 20 && confidence === 'great') confidence = 'ok';

      return {
        clubId: e.clubId,
        clubName: e.clubName,
        bookCarry: e.bookCarry,
        delta: Math.round(delta * 10) / 10,
        confidence,
        freshness: e.freshness,
        dispersion: e.dispersion,
      };
    })
    .filter((r) => Math.abs(r.delta) <= 25)
    .sort((a, b) => {
      // Sort: great > ok > stretch, then by abs delta
      const confOrder = { great: 0, ok: 1, stretch: 2 };
      const confDiff = confOrder[a.confidence] - confOrder[b.confidence];
      if (confDiff !== 0) return confDiff;
      return Math.abs(a.delta) - Math.abs(b.delta);
    })
    .slice(0, 3);

  return recommendations;
}
