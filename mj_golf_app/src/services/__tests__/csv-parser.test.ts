import { parseCsvFile } from '../csv-parser';

describe('parseCsvFile', () => {
  it('returns empty result for text with fewer than 2 lines', () => {
    const result = parseCsvFile('Carry');
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('returns empty result for empty string', () => {
    const result = parseCsvFile('');
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('parses standard CSV with "Carry" header', () => {
    const csv = `Shot #,Carry,Total
1,155.2,167.8
2,152.1,164.5`;
    const result = parseCsvFile(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].carryYards).toBe(155.2);
    expect(result.rows[0].totalYards).toBe(167.8);
    expect(result.rows[0].shotNumber).toBe(1);
  });

  it('maps "carry distance" alias', () => {
    const csv = `Carry Distance,Total Distance
155.2,167.8`;
    const result = parseCsvFile(csv);
    expect(result.mappings['Carry Distance']).toBe('carryYards');
    expect(result.rows[0].carryYards).toBe(155.2);
  });

  it('maps "Carry (yds)" alias (case-insensitive)', () => {
    const csv = `Carry (yds),Total (yds)
155.2,167.8`;
    const result = parseCsvFile(csv);
    expect(result.mappings['Carry (yds)']).toBe('carryYards');
  });

  it('maps ball speed, club speed, launch angle aliases', () => {
    const csv = `Carry,Ball Speed,Club Head Speed,Launch Angle
155,112,87,17.2`;
    const result = parseCsvFile(csv);
    expect(result.rows[0].ballSpeed).toBe(112);
    expect(result.rows[0].clubHeadSpeed).toBe(87);
    expect(result.rows[0].launchAngle).toBe(17.2);
  });

  it('maps spin rate alias', () => {
    const csv = `Carry,Back Spin
155,6842`;
    const result = parseCsvFile(csv);
    expect(result.rows[0].spinRate).toBe(6842);
  });

  it('maps spin axis alias', () => {
    const csv = `Carry,Axis
155,-1.5`;
    const result = parseCsvFile(csv);
    expect(result.rows[0].spinAxis).toBe(-1.5);
  });

  it('maps apex height alias', () => {
    const csv = `Carry,Apex Height
155,28`;
    const result = parseCsvFile(csv);
    expect(result.rows[0].apexHeight).toBe(28);
  });

  it('maps offline alias', () => {
    const csv = `Carry,Offline
155,4.2`;
    const result = parseCsvFile(csv);
    expect(result.rows[0].offlineYards).toBe(4.2);
  });

  it('identifies unmapped headers', () => {
    const csv = `Carry,Notes,Weather
155,good shot,sunny`;
    const result = parseCsvFile(csv);
    expect(result.unmappedHeaders).toContain('Notes');
    expect(result.unmappedHeaders).toContain('Weather');
  });

  it('strips unit symbols from values', () => {
    const csv = `Carry
155.2 yds`;
    const result = parseCsvFile(csv);
    expect(result.rows[0].carryYards).toBe(155.2);
  });

  it('excludes rows where carry is 0', () => {
    const csv = `Carry,Total
155,167
0,10
148,160`;
    const result = parseCsvFile(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].carryYards).toBe(155);
    expect(result.rows[1].carryYards).toBe(148);
  });

  it('excludes completely empty rows', () => {
    const csv = `Carry,Total
155,167
,,
148,160`;
    const result = parseCsvFile(csv);
    expect(result.rows).toHaveLength(2);
  });

  it('handles quoted fields with commas', () => {
    const csv = `"Shot #","Carry (yds)","Notes"
1,"155.2","good shot, clean"
2,"152.1","pushed right"`;
    const result = parseCsvFile(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].carryYards).toBe(155.2);
  });

  it('assigns auto-incremented shotNumber when no shot column', () => {
    const csv = `Carry
155
148`;
    const result = parseCsvFile(csv);
    expect(result.rows[0].shotNumber).toBe(1); // i=1
    expect(result.rows[1].shotNumber).toBe(2); // i=2
  });

  it('maps shot number aliases', () => {
    const csv = `Shot,Carry
1,155
2,148`;
    const result = parseCsvFile(csv);
    expect(result.mappings['Shot']).toBe('shotNumber');
    expect(result.rows[0].shotNumber).toBe(1);
  });

  it('handles CR/LF line endings', () => {
    const csv = "Carry,Total\r\n155,167\r\n148,160";
    const result = parseCsvFile(csv);
    expect(result.rows).toHaveLength(2);
  });

  it('returns empty rows when no carry column exists', () => {
    const csv = `Notes,Weather
good,sunny
bad,rainy`;
    const result = parseCsvFile(csv);
    expect(result.rows).toHaveLength(0);
  });
});
