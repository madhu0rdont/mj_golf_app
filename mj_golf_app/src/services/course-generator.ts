import type { InterleavedHole } from '../models/session';

const DISTANCES = [
  125, 150, 175, 200, 225,  // par 3
  250, 275, 300, 325, 350, 375, 400, 425,  // par 4
  450, 475, 500, 525,  // par 5
];

export function getPar(distanceYards: number): number {
  if (distanceYards <= 225) return 3;
  if (distanceYards <= 425) return 4;
  return 5;
}

export function generateHoles(count: 9 | 18): InterleavedHole[] {
  const holes: InterleavedHole[] = [];
  for (let i = 0; i < count; i++) {
    const distance = DISTANCES[Math.floor(Math.random() * DISTANCES.length)];
    holes.push({
      number: i + 1,
      distanceYards: distance,
      par: getPar(distance),
    });
  }
  return holes;
}
