import { getPar, generateHoles } from '../course-generator';

describe('getPar', () => {
  it('returns 3 for 125 yards', () => {
    expect(getPar(125)).toBe(3);
  });

  it('returns 3 at the upper boundary of 225 yards', () => {
    expect(getPar(225)).toBe(3);
  });

  it('returns 4 just above par 3 boundary (226 yards)', () => {
    expect(getPar(226)).toBe(4);
  });

  it('returns 4 for mid-range 350 yards', () => {
    expect(getPar(350)).toBe(4);
  });

  it('returns 4 at the upper boundary of 425 yards', () => {
    expect(getPar(425)).toBe(4);
  });

  it('returns 5 just above par 4 boundary (426 yards)', () => {
    expect(getPar(426)).toBe(5);
  });

  it('returns 5 for 500 yards', () => {
    expect(getPar(500)).toBe(5);
  });

  it('returns 5 for 525 yards (max distance)', () => {
    expect(getPar(525)).toBe(5);
  });
});

describe('generateHoles', () => {
  it('generates 9 holes for count=9', () => {
    expect(generateHoles(9)).toHaveLength(9);
  });

  it('generates 18 holes for count=18', () => {
    expect(generateHoles(18)).toHaveLength(18);
  });

  it('assigns sequential hole numbers starting at 1', () => {
    const holes = generateHoles(9);
    holes.forEach((h, i) => expect(h.number).toBe(i + 1));
  });

  it('all distances are in the valid set (125-525, 25-yd increments)', () => {
    const valid = new Set([125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 375, 400, 425, 450, 475, 500, 525]);
    const holes = generateHoles(18);
    holes.forEach((h) => expect(valid.has(h.distanceYards)).toBe(true));
  });

  it('par matches getPar for each hole', () => {
    const holes = generateHoles(18);
    holes.forEach((h) => expect(h.par).toBe(getPar(h.distanceYards)));
  });

  it('returns objects with correct InterleavedHole shape', () => {
    const holes = generateHoles(9);
    holes.forEach((h) => {
      expect(h).toEqual(expect.objectContaining({
        number: expect.any(Number),
        distanceYards: expect.any(Number),
        par: expect.any(Number),
      }));
    });
  });

  it('produces varying distances across holes', () => {
    // With 18 holes drawn from 17 possible distances, virtually guaranteed to have > 1 unique
    const holes = generateHoles(18);
    const unique = new Set(holes.map((h) => h.distanceYards));
    expect(unique.size).toBeGreaterThan(1);
  });
});
