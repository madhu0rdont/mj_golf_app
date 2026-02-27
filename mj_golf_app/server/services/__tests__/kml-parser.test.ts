// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseKml } from '../kml-parser';

/** Build a minimal valid 18-hole KML string */
function buildKml(overrides?: {
  skipHole?: number;
  skipTee?: number;
  skipPin?: number;
  skipTour?: number;
  extraPlacemarks?: string;
  targetCount?: number;
  includeCenterLine?: boolean;
}): string {
  const opts = {
    targetCount: 0,
    includeCenterLine: false,
    ...overrides,
  };

  const placemarks: string[] = [];
  const tours: string[] = [];

  for (let i = 1; i <= 18; i++) {
    if (i === opts.skipHole) continue;

    const lat = 33.0 + i * 0.001;
    const lng = -117.0 + i * 0.0001;

    if (i !== opts.skipTee) {
      placemarks.push(`
        <Placemark>
          <name>Hole ${i} Tee</name>
          <Point><coordinates>${lng},${lat},0</coordinates></Point>
        </Placemark>
      `);
    }

    if (i !== opts.skipPin) {
      placemarks.push(`
        <Placemark>
          <name>Hole ${i} Pin</name>
          <Point><coordinates>${lng + 0.003},${lat + 0.003},10</coordinates></Point>
        </Placemark>
      `);
    }

    for (let t = 1; t <= opts.targetCount; t++) {
      const frac = t / (opts.targetCount + 1);
      placemarks.push(`
        <Placemark>
          <name>Hole ${i} Target ${t}</name>
          <Point><coordinates>${lng + 0.003 * frac},${lat + 0.003 * frac},5</coordinates></Point>
        </Placemark>
      `);
    }

    if (opts.includeCenterLine) {
      placemarks.push(`
        <Placemark>
          <name>Hole ${i} Center Line</name>
          <LineString><coordinates>${lng},${lat},0 ${lng + 0.003},${lat + 0.003},10</coordinates></LineString>
        </Placemark>
      `);
    }

    if (i !== opts.skipTour) {
      const par = i <= 4 ? 4 : i <= 8 ? 3 : i <= 14 ? 4 : 5;
      const yardage = par * 100;
      tours.push(`
        <Tour>
          <name>Hole ${i} - Par ${par} - ${yardage} yards</name>
          <Playlist>
            <FlyTo>
              <LookAt><heading>${i * 20}</heading></LookAt>
            </FlyTo>
          </Playlist>
        </Tour>
      `);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Folder>
      ${placemarks.join('\n')}
      ${opts.extraPlacemarks ?? ''}
      ${tours.join('\n')}
    </Folder>
  </Document>
</kml>`;
}

describe('parseKml', () => {
  it('parses a minimal valid 18-hole KML', () => {
    const kml = buildKml();
    const result = parseKml(kml);
    expect(result.holes).toHaveLength(18);
  });

  it('extracts correct hole numbers in order', () => {
    const result = parseKml(buildKml());
    for (let i = 0; i < 18; i++) {
      expect(result.holes[i].holeNumber).toBe(i + 1);
    }
  });

  it('swaps KML lon,lat to lat,lng format', () => {
    const result = parseKml(buildKml());
    const hole1 = result.holes[0];
    // Hole 1 tee: lat=33.001, lng=-116.9999
    expect(hole1.tee.lat).toBeCloseTo(33.001, 3);
    expect(hole1.tee.lng).toBeCloseTo(-116.9999, 3);
  });

  it('extracts par and yardage from tour names', () => {
    const result = parseKml(buildKml());
    // Holes 1-4 are par 4, yardage=400
    expect(result.holes[0].par).toBe(4);
    expect(result.holes[0].yardage).toBe(400);
    // Holes 5-8 are par 3, yardage=300
    expect(result.holes[4].par).toBe(3);
    expect(result.holes[4].yardage).toBe(300);
  });

  it('extracts heading from FlyTo > LookAt', () => {
    const result = parseKml(buildKml());
    expect(result.holes[0].heading).toBe(20);
    expect(result.holes[1].heading).toBe(40);
  });

  it('extracts targets and sorts by index', () => {
    const result = parseKml(buildKml({ targetCount: 3 }));
    const hole1 = result.holes[0];
    expect(hole1.targets).toHaveLength(3);
    expect(hole1.targets[0].index).toBe(1);
    expect(hole1.targets[1].index).toBe(2);
    expect(hole1.targets[2].index).toBe(3);
  });

  it('extracts center line coordinates', () => {
    const result = parseKml(buildKml({ includeCenterLine: true }));
    const hole1 = result.holes[0];
    expect(hole1.centerLine.length).toBeGreaterThanOrEqual(2);
  });

  it('defaults heading to 0 when no FlyTo heading present', () => {
    // Build a KML with a tour that has no heading
    const kml = buildKml().replace(
      /<Playlist>[\s\S]*?<\/Playlist>/,
      '<Playlist><FlyTo><LookAt></LookAt></FlyTo></Playlist>',
    );
    const result = parseKml(kml);
    expect(result.holes[0].heading).toBe(0);
  });

  it('throws when Document element is missing', () => {
    expect(() => parseKml('<kml></kml>')).toThrow('Invalid KML');
  });

  it('throws when a hole is missing its tee placemark', () => {
    expect(() => parseKml(buildKml({ skipTee: 5 }))).toThrow('Hole 5: missing tee');
  });

  it('throws when a hole is missing its pin placemark', () => {
    expect(() => parseKml(buildKml({ skipPin: 12 }))).toThrow('Hole 12: missing pin');
  });

  it('throws when a hole is missing tour data', () => {
    expect(() => parseKml(buildKml({ skipTour: 3 }))).toThrow('Hole 3: missing tour');
  });

  it('handles placemarks directly in Document (not in Folder)', () => {
    // Build KML without Folder wrapper
    let kml = buildKml();
    kml = kml.replace('<Folder>', '').replace('</Folder>', '');
    const result = parseKml(kml);
    expect(result.holes).toHaveLength(18);
  });

  it('preserves altitude in tee and pin coordinates', () => {
    const result = parseKml(buildKml());
    // Pin has alt=10 in our fixture
    expect(result.holes[0].pin.alt).toBe(10);
    // Tee has alt=0
    expect(result.holes[0].tee.alt).toBe(0);
  });
});
