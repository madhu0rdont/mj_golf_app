export interface ParsedCsvRow {
  shotNumber: number;
  carryYards?: number;
  totalYards?: number;
  ballSpeed?: number;
  clubHeadSpeed?: number;
  launchAngle?: number;
  spinRate?: number;
  spinAxis?: number;
  apexHeight?: number;
  offlineYards?: number;
}

export interface CsvParseResult {
  headers: string[];
  rows: ParsedCsvRow[];
  mappings: Record<string, string>;
  unmappedHeaders: string[];
}

// Known column name variations from GC4/FSX exports
const COLUMN_ALIASES: Record<string, string[]> = {
  carryYards: ['carry', 'carry distance', 'carry (yds)', 'carry yds', 'carry_distance'],
  totalYards: ['total', 'total distance', 'total (yds)', 'total yds', 'total_distance'],
  ballSpeed: ['ball speed', 'ball spd', 'ball_speed', 'ball speed (mph)'],
  clubHeadSpeed: ['club speed', 'club head speed', 'club_speed', 'clubhead speed', 'club speed (mph)', 'club head speed (mph)'],
  launchAngle: ['launch', 'launch angle', 'launch_angle', 'launch angle (deg)', 'la'],
  spinRate: ['spin', 'spin rate', 'spin_rate', 'back spin', 'backspin', 'spin (rpm)'],
  spinAxis: ['spin axis', 'spin_axis', 'axis', 'spin axis (deg)'],
  apexHeight: ['apex', 'apex height', 'apex_height', 'height', 'peak height', 'apex (ft)'],
  offlineYards: ['offline', 'offline distance', 'offline_distance', 'lateral', 'side', 'offline (yds)'],
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
}

function autoMapColumns(headers: string[]): Record<string, string> {
  const mappings: Record<string, string> = {};

  for (const header of headers) {
    const normalized = normalizeHeader(header);

    // Check each field's aliases
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.some((alias) => normalized === alias || normalized.includes(alias))) {
        mappings[header] = field;
        break;
      }
    }

    // Check for shot number
    if (!mappings[header]) {
      const shotAliases = ['shot', 'shot #', 'shot number', '#', 'no'];
      if (shotAliases.some((a) => normalized === a)) {
        mappings[header] = 'shotNumber';
      }
    }
  }

  return mappings;
}

function parseCsvText(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  return lines.map((line) => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

export function parseCsvFile(text: string): CsvParseResult {
  const grid = parseCsvText(text);
  if (grid.length < 2) {
    return { headers: [], rows: [], mappings: {}, unmappedHeaders: [] };
  }

  const headers = grid[0];
  const mappings = autoMapColumns(headers);
  const unmappedHeaders = headers.filter((h) => !mappings[h]);

  const rows: ParsedCsvRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const cells = grid[i];
    if (cells.length === 0 || cells.every((c) => c === '')) continue;

    const row: Record<string, number | undefined> = {};
    for (let j = 0; j < headers.length; j++) {
      const field = mappings[headers[j]];
      if (field && cells[j]) {
        const value = parseFloat(cells[j].replace(/[^0-9.\-]/g, ''));
        if (!isNaN(value)) {
          row[field] = value;
        }
      }
    }

    // Only include rows that have at least a carry distance
    if (row.carryYards != null && row.carryYards > 0) {
      rows.push({
        shotNumber: row.shotNumber ?? i,
        carryYards: row.carryYards,
        totalYards: row.totalYards,
        ballSpeed: row.ballSpeed,
        clubHeadSpeed: row.clubHeadSpeed,
        launchAngle: row.launchAngle,
        spinRate: row.spinRate,
        spinAxis: row.spinAxis,
        apexHeight: row.apexHeight,
        offlineYards: row.offlineYards,
      });
    }
  }

  return { headers, rows, mappings, unmappedHeaders };
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
