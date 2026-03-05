import jsPDF from 'jspdf';
import { bearingBetween } from '../utils/geo';
import type { GamePlan, HolePlan } from './game-plan';
import type { AimPoint } from './strategy-optimizer';
import type { CourseHole } from '../models/course';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
const MARGIN = 28;
const PAGE_WIDTH = 595.28; // A4 portrait
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const MAP_SIZE = 130; // pt (square)
const MAP_GAP = 10; // pt gap between map and text
const MAP_PX_SCALE = 2; // render at 2x for crisp PDF output
const MAP_PX = MAP_SIZE * MAP_PX_SCALE; // canvas pixels

type RGB = [number, number, number];
const C = {
  green: [46, 125, 50] as RGB, // birdie opportunity
  yellow: [191, 155, 48] as RGB, // standard hole
  red: [198, 78, 56] as RGB, // blowup risk
  text: [28, 28, 28] as RGB,
  muted: [110, 110, 110] as RGB,
  light: [160, 160, 160] as RGB,
  bg: [247, 247, 245] as RGB, // card fill
  white: [255, 255, 255] as RGB,
  border: [215, 215, 215] as RGB,
  headerBg: [38, 38, 38] as RGB,
  headerText: [255, 255, 255] as RGB,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setFont(doc: jsPDF, style: 'normal' | 'bold', size: number, color: RGB) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

/** Check if we need a new page, and add one if so */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_HEIGHT - MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

/** Draw a rounded-rect card background */
function drawCard(doc: jsPDF, y: number, height: number) {
  doc.setFillColor(...C.bg);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 3, 3, 'F');
}

// ---------------------------------------------------------------------------
// Canvas-based tactical hole map
// ---------------------------------------------------------------------------

const HAZARD_COLORS: Record<string, string> = {
  bunker: '#FFD700',
  fairway_bunker: '#DAA520',
  greenside_bunker: '#FFA500',
  water: '#4169E1',
  ob: '#FF4444',
  trees: '#228B22',
  rough: '#6B5B3D',
  green: '#00C853',
};

const YARDS_PER_DEG_LAT = 121546;

interface Projection {
  project: (p: { lat: number; lng: number }) => { x: number; y: number };
}

function buildProjection(
  hole: CourseHole,
  aimPoints: AimPoint[],
  canvasW: number,
  canvasH: number,
): Projection {
  const center = {
    lat: (hole.tee.lat + hole.pin.lat) / 2,
    lng: (hole.tee.lng + hole.pin.lng) / 2,
  };
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const yPerDegLng = YARDS_PER_DEG_LAT * cosLat;

  // Rotation: tee at bottom, pin at top
  const bearing = bearingBetween(hole.tee, hole.pin);
  const rotRad = ((90 - bearing) * Math.PI) / 180;
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  function toLocal(p: { lat: number; lng: number }): { x: number; y: number } {
    const dx = (p.lng - center.lng) * yPerDegLng;
    const dy = (p.lat - center.lat) * YARDS_PER_DEG_LAT;
    return { x: dx * cosR - dy * sinR, y: dx * sinR + dy * cosR };
  }

  // Collect all points for bounding box
  const pts: { x: number; y: number }[] = [toLocal(hole.tee), toLocal(hole.pin)];
  for (const poly of hole.fairway) for (const p of poly) pts.push(toLocal(p));
  for (const p of hole.green) pts.push(toLocal(p));
  for (const h of hole.hazards) for (const p of h.polygon) pts.push(toLocal(p));
  for (const a of aimPoints) pts.push(toLocal(a.position));

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  // Enforce minimum range (prevents over-zoom on par 3s)
  const MIN_RANGE = 80;
  let rangeX = maxX - minX || 1;
  let rangeY = maxY - minY || 1;
  if (rangeX < MIN_RANGE) {
    const pad = (MIN_RANGE - rangeX) / 2;
    minX -= pad;
    maxX += pad;
    rangeX = MIN_RANGE;
  }
  if (rangeY < MIN_RANGE) {
    const pad = (MIN_RANGE - rangeY) / 2;
    minY -= pad;
    maxY += pad;
    rangeY = MIN_RANGE;
  }

  // Add 15% padding
  const padX = rangeX * 0.15;
  const padY = rangeY * 0.15;
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;
  rangeX += 2 * padX;
  rangeY += 2 * padY;

  const scale = Math.min(canvasW / rangeX, canvasH / rangeY);
  const offsetX = (canvasW - rangeX * scale) / 2;
  const offsetY = (canvasH - rangeY * scale) / 2;

  return {
    project(p: { lat: number; lng: number }) {
      const local = toLocal(p);
      return {
        x: offsetX + (local.x - minX) * scale,
        y: canvasH - offsetY - (local.y - minY) * scale, // flip Y
      };
    },
  };
}

function drawCanvasPolygon(
  ctx: CanvasRenderingContext2D,
  points: { lat: number; lng: number }[],
  proj: Projection,
  fillStyle: string,
  strokeStyle: string,
  lineWidth: number,
  lineDash?: number[],
) {
  if (points.length < 3) return;
  ctx.fillStyle = fillStyle;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(lineDash ?? []);
  ctx.beginPath();
  const first = proj.project(points[0]);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = proj.project(points[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawCircleMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  bgColor: string,
  radius: number,
) {
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${Math.round(radius * 1.1)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 1);
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  size: number,
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.fillStyle = '#00E5FF';
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - size * Math.cos(angle - 0.4), toY - size * Math.sin(angle - 0.4));
  ctx.lineTo(toX - size * Math.cos(angle + 0.4), toY - size * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

function renderHoleMapCanvas(hole: CourseHole, aimPoints: AimPoint[]): string {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_PX;
  canvas.height = MAP_PX;
  const ctx = canvas.getContext('2d')!;

  const proj = buildProjection(hole, aimPoints, MAP_PX, MAP_PX);

  // 1. Background
  ctx.fillStyle = '#1B4332';
  ctx.fillRect(0, 0, MAP_PX, MAP_PX);

  // 2. Rounded corners mask
  const cr = 8 * MAP_PX_SCALE;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  ctx.moveTo(cr, 0);
  ctx.lineTo(MAP_PX - cr, 0);
  ctx.quadraticCurveTo(MAP_PX, 0, MAP_PX, cr);
  ctx.lineTo(MAP_PX, MAP_PX - cr);
  ctx.quadraticCurveTo(MAP_PX, MAP_PX, MAP_PX - cr, MAP_PX);
  ctx.lineTo(cr, MAP_PX);
  ctx.quadraticCurveTo(0, MAP_PX, 0, MAP_PX - cr);
  ctx.lineTo(0, cr);
  ctx.quadraticCurveTo(0, 0, cr, 0);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Re-fill background after mask
  ctx.fillStyle = '#1B4332';
  ctx.fillRect(0, 0, MAP_PX, MAP_PX);

  // 3. Fairway polygons
  for (const poly of hole.fairway) {
    drawCanvasPolygon(ctx, poly, proj, 'rgba(144,238,144,0.30)', 'rgba(144,238,144,0.45)', 1);
  }

  // 4. Green polygon
  if (hole.green?.length >= 3) {
    drawCanvasPolygon(ctx, hole.green, proj, 'rgba(0,200,83,0.45)', 'rgba(0,200,83,0.7)', 1.5);
  }

  // 5. Hazards
  for (const h of hole.hazards) {
    if (h.polygon.length < 3) continue;
    const color = HAZARD_COLORS[h.type] ?? '#FFFFFF';
    const isOB = h.type === 'ob';
    const fillAlpha = isOB ? 0.12 : 0.35;
    const strokeAlpha = isOB ? 0.6 : 0.7;
    // Parse hex to rgba
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    drawCanvasPolygon(
      ctx,
      h.polygon,
      proj,
      `rgba(${r},${g},${b},${fillAlpha})`,
      `rgba(${r},${g},${b},${strokeAlpha})`,
      isOB ? 1.5 : 1,
      isOB ? [6, 4] : undefined,
    );
  }

  // 6. Center line (subtle)
  if (hole.centerLine?.length > 1) {
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const first = proj.project(hole.centerLine[0]);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < hole.centerLine.length; i++) {
      const p = proj.project(hole.centerLine[i]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 7. Shot paths (cyan dashed with arrowheads)
  const markerR = 9 * MAP_PX_SCALE / 2;
  for (let i = 0; i < aimPoints.length; i++) {
    const from = i === 0 ? { lat: hole.tee.lat, lng: hole.tee.lng } : aimPoints[i - 1].position;
    const to = aimPoints[i].position;
    const fp = proj.project(from);
    const tp = proj.project(to);

    ctx.strokeStyle = 'rgba(0,229,255,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.moveTo(fp.x, fp.y);
    ctx.lineTo(tp.x, tp.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowhead at midpoint
    const mx = (fp.x + tp.x) / 2;
    const my = (fp.y + tp.y) / 2;
    drawArrowHead(ctx, fp.x, fp.y, mx, my, 7);
  }

  // 8. Aim point markers (numbered)
  for (let i = 0; i < aimPoints.length; i++) {
    const p = proj.project(aimPoints[i].position);
    drawCircleMarker(ctx, p.x, p.y, String(i + 1), '#00BCD4', markerR);
  }

  // 9. Tee marker
  const teeP = proj.project(hole.tee);
  drawCircleMarker(ctx, teeP.x, teeP.y, 'T', '#3B82F6', markerR);

  // 10. Pin marker
  const pinP = proj.project(hole.pin);
  drawCircleMarker(ctx, pinP.x, pinP.y, 'P', '#EF4444', markerR);

  return canvas.toDataURL('image/png');
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderHeader(doc: jsPDF, plan: GamePlan): number {
  let y = MARGIN;

  // Dark header bar
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, PAGE_WIDTH, 72, 'F');

  // Course name
  setFont(doc, 'bold', 18, C.headerText);
  doc.text(plan.courseName, MARGIN, 30);

  // Subtitle
  const teeLabel = plan.teeBox.charAt(0).toUpperCase() + plan.teeBox.slice(1);
  setFont(doc, 'normal', 9, [190, 190, 190] as RGB);
  doc.text(`${teeLabel} Tees  |  ${plan.date}`, MARGIN, 48);

  y = 88;

  // Summary row: Expected Total + Plays-Like + Key Holes
  setFont(doc, 'bold', 22, C.text);
  doc.text(plan.totalExpected.toFixed(1), MARGIN, y);
  setFont(doc, 'normal', 9, C.muted);
  doc.text('Expected', MARGIN, y + 13);

  const col2 = MARGIN + 90;
  setFont(doc, 'bold', 14, C.text);
  doc.text(`${plan.totalPlaysLike}`, col2, y);
  setFont(doc, 'normal', 9, C.muted);
  doc.text('Plays-Like Yds', col2, y + 13);

  if (plan.keyHoles.length > 0) {
    const col3 = MARGIN + 210;
    setFont(doc, 'bold', 14, C.text);
    doc.text(plan.keyHoles.join(', '), col3, y);
    setFont(doc, 'normal', 9, C.muted);
    doc.text('Key Holes', col3, y + 13);
  }

  // Score distribution bar
  y += 30;
  const bd = plan.breakdown;
  const segments: { label: string; pct: number; color: RGB }[] = [
    { label: 'Birdie', pct: bd.birdie, color: C.green },
    { label: 'Par', pct: bd.par, color: [100, 160, 110] as RGB },
    { label: 'Bogey', pct: bd.bogey, color: C.yellow },
    { label: 'Double+', pct: bd.double + bd.worse, color: C.red },
  ];
  const barWidth = CONTENT_WIDTH;
  const barHeight = 8;
  let bx = MARGIN;
  for (const seg of segments) {
    const w = barWidth * seg.pct;
    if (w < 1) continue;
    doc.setFillColor(...seg.color);
    doc.rect(bx, y, w, barHeight, 'F');
    bx += w;
  }

  // Legend under bar
  y += barHeight + 10;
  let lx = MARGIN;
  setFont(doc, 'normal', 7, C.muted);
  for (const seg of segments) {
    if (seg.pct < 0.01) continue;
    doc.setFillColor(...seg.color);
    doc.circle(lx + 3, y - 2, 2.5, 'F');
    doc.text(`${seg.label} ${(seg.pct * 100).toFixed(0)}%`, lx + 9, y);
    lx += 70;
  }

  y += 14;

  // Divider
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 8;

  return y;
}

function renderNineHeader(doc: jsPDF, label: string, y: number): number {
  y = ensureSpace(doc, y, 22);
  setFont(doc, 'bold', 10, C.muted);
  doc.text(label, MARGIN, y + 10);
  y += 18;
  return y;
}

function measureCard(doc: jsPDF, hole: HolePlan, hasMap: boolean): number {
  const PAD = 10;
  const textWidth = hasMap ? CONTENT_WIDTH - MAP_SIZE - MAP_GAP - 14 : CONTENT_WIDTH - 36;
  let h = 42; // header row (hole # + strategy name) + club row
  // Measure each tip's wrapped height
  if (hole.strategy.aimPoints.length > 0) {
    setFont(doc, 'normal', 7.5, C.muted);
    for (const ap of hole.strategy.aimPoints) {
      const carryPart = ap.carry > 0 ? `${ap.carry}y${ap.carryNote ? ` (${ap.carryNote})` : ''} - ` : '';
      const tipText = `${ap.shotNumber}. ${carryPart}${ap.tip}`;
      const lines = doc.splitTextToSize(tipText, textWidth);
      h += lines.length * 10;
    }
    h += 2; // gap before tips
  }
  const textH = h + PAD;
  // Enforce minimum height for map
  return hasMap ? Math.max(textH, MAP_SIZE + PAD) : textH;
}

function renderHoleCard(
  doc: jsPDF,
  hole: HolePlan,
  y: number,
  mapDataUrl: string | null,
): number {
  const hasMap = mapDataUrl !== null;
  const color = C[hole.colorCode];
  const cardH = measureCard(doc, hole, hasMap);

  y = ensureSpace(doc, y, cardH + 4);

  // Card background
  drawCard(doc, y, cardH);

  // Color accent bar (left edge)
  doc.setFillColor(...color);
  doc.roundedRect(MARGIN, y, 4, cardH, 2, 2, 'F');
  doc.rect(MARGIN + 2, y, 2, cardH, 'F');

  // Map image (if available)
  if (hasMap) {
    const mapX = MARGIN + 8;
    const mapY = y + (cardH - MAP_SIZE) / 2; // vertically centered
    doc.addImage(mapDataUrl, 'PNG', mapX, mapY, MAP_SIZE, MAP_SIZE);
  }

  // Text positioning
  const textLeft = hasMap ? MARGIN + 8 + MAP_SIZE + MAP_GAP : MARGIN + 14;
  const textWidth = hasMap ? CONTENT_WIDTH - MAP_SIZE - MAP_GAP - 14 : CONTENT_WIDTH - 36;

  // Row 1: Hole # (bold) | Par · Yds (plays X) | xS right-aligned
  let ry = y + 14;

  setFont(doc, 'bold', 12, C.text);
  doc.text(`#${hole.holeNumber}`, textLeft, ry);

  const holeNumW = doc.getTextWidth(`#${hole.holeNumber}`);
  setFont(doc, 'normal', 8.5, C.muted);
  let meta = `Par ${hole.par}  |  ${hole.yardage} yds`;
  if (hole.playsLikeYardage) meta += ` (plays ${hole.playsLikeYardage})`;
  doc.text(meta, textLeft + holeNumW + 8, ry);

  // xS badge right-aligned
  const xsText = `${hole.strategy.expectedStrokes.toFixed(1)} xS`;
  setFont(doc, 'bold', 10, color);
  const xsW = doc.getTextWidth(xsText);
  doc.text(xsText, PAGE_WIDTH - MARGIN - 10 - xsW, ry);

  // Row 2: Strategy name (bold) + club sequence
  ry += 16;
  setFont(doc, 'bold', 8.5, C.text);
  doc.text(hole.strategy.strategyName, textLeft, ry);

  const nameW = doc.getTextWidth(hole.strategy.strategyName);
  const clubSeq = hole.strategy.clubs.map((c) => c.clubName).join('  >  ');
  setFont(doc, 'normal', 8, C.light);
  const maxClubW = textWidth - nameW - 20;
  if (maxClubW > 30) {
    doc.text(clubSeq, textLeft + nameW + 10, ry, { maxWidth: maxClubW });
  }

  // Row 3+: Caddy tips
  if (hole.strategy.aimPoints.length > 0) {
    ry += 14;
    setFont(doc, 'normal', 7.5, C.muted);
    for (const ap of hole.strategy.aimPoints) {
      const carryPart = ap.carry > 0 ? `${ap.carry}y${ap.carryNote ? ` (${ap.carryNote})` : ''} - ` : '';
      const tipText = `${ap.shotNumber}. ${carryPart}${ap.tip}`;
      const lines = doc.splitTextToSize(tipText, textWidth);
      doc.text(lines, textLeft, ry);
      ry += lines.length * 10;
    }
  }

  return y + cardH + 4;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function exportGamePlanPDF(plan: GamePlan, courseHoles?: CourseHole[]): void {
  const doc = new jsPDF('portrait', 'pt', 'a4');

  // Pre-render all hole maps
  const holeMaps = new Map<number, string>();
  if (courseHoles) {
    for (const holePlan of plan.holes) {
      const courseHole = courseHoles.find((h) => h.holeNumber === holePlan.holeNumber);
      if (courseHole && holePlan.strategy.aimPoints.length > 0) {
        try {
          holeMaps.set(holePlan.holeNumber, renderHoleMapCanvas(courseHole, holePlan.strategy.aimPoints));
        } catch {
          // Skip map for this hole on error
        }
      }
    }
  }

  let y = renderHeader(doc, plan);

  const totalHoles = plan.holes.length;
  for (let i = 0; i < totalHoles; i++) {
    // Front/Back nine headers (only for 18-hole courses)
    if (totalHoles > 9 && i === 0) y = renderNineHeader(doc, 'FRONT NINE', y);
    if (totalHoles > 9 && i === 9) y = renderNineHeader(doc, 'BACK NINE', y);

    const mapUrl = holeMaps.get(plan.holes[i].holeNumber) ?? null;
    y = renderHoleCard(doc, plan.holes[i], y, mapUrl);
  }

  doc.save(`${plan.courseName.replace(/\s+/g, '_')}_GamePlan.pdf`);
}
