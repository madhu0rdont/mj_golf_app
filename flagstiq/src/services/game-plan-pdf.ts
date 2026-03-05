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

const MAP_SIZE = 110; // pt (square)
const MAP_GAP = 8; // pt gap between map and text
const MAP_PX_SCALE = 2; // render at 2x for crisp PDF output
const MAP_PX = MAP_SIZE * MAP_PX_SCALE; // canvas pixels

// ---------------------------------------------------------------------------
// Design system — mirrors website theme (index.css + GamePlanView.tsx)
// ---------------------------------------------------------------------------
type RGB = [number, number, number];

const C = {
  // App brand palette
  forest: [26, 46, 30] as RGB, // #1a2e1e
  turf: [45, 90, 39] as RGB, // #2d5a27
  fairway: [61, 122, 53] as RGB, // #3d7a35
  sage: [107, 158, 99] as RGB, // #6b9e63

  // Accent colors (match GamePlanView BORDER_COLORS / SCORE_PILLS)
  green: [64, 145, 108] as RGB, // #40916C — birdie / good holes
  yellow: [212, 168, 67] as RGB, // #D4A843 — standard holes
  red: [231, 111, 81] as RGB, // #E76F51 — blowup risk

  // Score pill colors
  par: [45, 106, 79] as RGB, // #2D6A4F
  bogey: [155, 155, 155] as RGB, // #9B9B9B

  // Text — darkened from website values for print legibility
  textDark: [14, 26, 16] as RGB, // #0e1a10
  textMedium: [60, 70, 58] as RGB, // #3c463a
  textMuted: [120, 110, 90] as RGB, // #786e5a — readable on white
  textFaint: [160, 150, 130] as RGB, // #a09682

  // Surface
  surface: [244, 240, 232] as RGB, // #f4f0e8 — linen
  card: [255, 255, 255] as RGB,
  border: [232, 226, 212] as RGB, // #e8e2d4 — parchment

  white: [255, 255, 255] as RGB,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setFont(doc: jsPDF, style: 'normal' | 'bold', size: number, color: RGB) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_HEIGHT - MARGIN) {
    doc.addPage();
    doc.setFillColor(...C.surface);
    doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');
    return MARGIN;
  }
  return y;
}

function drawCard(doc: jsPDF, y: number, height: number) {
  doc.setFillColor(...C.card);
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.5);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 4, 4, 'FD');
}

// ---------------------------------------------------------------------------
// Canvas-based tactical hole map — matches HoleViewer design language
// ---------------------------------------------------------------------------

// Exact colors from HoleViewer.tsx
const HAZARD_COLORS: Record<string, string> = {
  bunker: '#FFD700',
  fairway_bunker: '#DAA520',
  greenside_bunker: '#FFA500',
  water: '#4169E1',
  ob: '#FF4444',
  trees: '#228B22',
  rough: '#8B7355',
  green: '#00C853',
};
const SIM_CYAN = '#00E5FF';

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

  // Rotate so tee is at 6 o'clock (bottom), pin at 12 o'clock (top)
  const bearing = bearingBetween(hole.tee, hole.pin);
  const rotRad = (bearing * Math.PI) / 180;
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  function toLocal(p: { lat: number; lng: number }): { x: number; y: number } {
    const dx = (p.lng - center.lng) * yPerDegLng;
    const dy = (p.lat - center.lat) * YARDS_PER_DEG_LAT;
    return { x: dx * cosR - dy * sinR, y: dx * sinR + dy * cosR };
  }

  // Bounding box: only fairway, green, bunkers, tee, pin, and aim points.
  // OB/water/trees/rough are excluded so the crop maximizes legibility.
  const CROP_TYPES = new Set(['bunker', 'fairway_bunker', 'greenside_bunker']);
  const pts: { x: number; y: number }[] = [toLocal(hole.tee), toLocal(hole.pin)];
  for (const poly of hole.fairway) for (const p of poly) pts.push(toLocal(p));
  for (const p of hole.green) pts.push(toLocal(p));
  for (const h of hole.hazards) {
    if (CROP_TYPES.has(h.type)) {
      for (const p of h.polygon) pts.push(toLocal(p));
    }
  }
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
        y: canvasH - offsetY - (local.y - minY) * scale,
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
  // Shadow (matches HoleViewer box-shadow)
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // White border
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Label
  ctx.fillStyle = label.length > 1 ? '#000000' : '#FFFFFF'; // Numbers black, letters white
  ctx.font = `bold ${Math.round(radius * 1.1)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 1);
}

function renderHoleMapCanvas(hole: CourseHole, aimPoints: AimPoint[]): string {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_PX;
  canvas.height = MAP_PX;
  const ctx = canvas.getContext('2d')!;

  const proj = buildProjection(hole, aimPoints, MAP_PX, MAP_PX);
  const markerR = 10;

  // 1. Background — dark fairway green (matches app sky/grass: #1B4332)
  ctx.fillStyle = '#1B4332';
  ctx.fillRect(0, 0, MAP_PX, MAP_PX);

  // 2. Rounded corners
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
  ctx.fillStyle = '#1B4332';
  ctx.fillRect(0, 0, MAP_PX, MAP_PX);

  // 3. Fairway polygons — HoleViewer: fillColor FAIRWAY_COLOR, fillOpacity 0.2
  for (const poly of hole.fairway) {
    drawCanvasPolygon(ctx, poly, proj, 'rgba(144,238,144,0.20)', 'rgba(144,238,144,0.40)', 1);
  }

  // 4. Green polygon — HoleViewer: fillColor GREEN_COLOR, fillOpacity 0.3
  if (hole.green?.length >= 3) {
    drawCanvasPolygon(ctx, hole.green, proj, 'rgba(0,200,83,0.30)', 'rgba(0,200,83,0.60)', 1);
  }

  // 5. Hazards — draw bunkers, water, and trees (skip OB and rough for legibility)
  const SKIP_TYPES = new Set(['ob', 'rough']);
  for (const h of hole.hazards) {
    if (h.polygon.length < 3 || SKIP_TYPES.has(h.type)) continue;
    const color = HAZARD_COLORS[h.type] ?? '#FFFFFF';
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    {
      // HoleViewer: fillOpacity 0.3, strokeWeight 2
      drawCanvasPolygon(
        ctx,
        h.polygon,
        proj,
        `rgba(${r},${g},${b},0.30)`,
        `rgba(${r},${g},${b},0.70)`,
        2,
      );
    }
  }

  // 6. Center line — HoleViewer: white dashed, strokeOpacity 0.7, strokeWeight 2
  if (hole.centerLine?.length > 1) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
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

  // 7. Shot visualization — dual lines matching HoleViewer:
  //    Line 1: White dashed aim line (where to point the club)
  //    Line 2: Solid cyan flight line (actual ball path)
  for (let i = 0; i < aimPoints.length; i++) {
    const from = i === 0 ? { lat: hole.tee.lat, lng: hole.tee.lng } : aimPoints[i - 1].position;
    const aimTo = aimPoints[i].position;
    const fp = proj.project(from);
    const tp = proj.project(aimTo);

    // Aim line — white dashed (HoleViewer: strokeOpacity 0.5, strokeColor #FFFFFF, strokeWeight 1.5)
    ctx.strokeStyle = 'rgba(255,255,255,0.50)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(fp.x, fp.y);
    ctx.lineTo(tp.x, tp.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ball flight — solid cyan (HoleViewer: strokeColor #00E5FF, strokeWeight 2.5, strokeOpacity 0.9)
    ctx.strokeStyle = 'rgba(0,229,255,0.90)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(fp.x, fp.y);
    ctx.lineTo(tp.x, tp.y);
    ctx.stroke();

    // Forward arrow at midpoint (HoleViewer: FORWARD_CLOSED_ARROW, scale 3, fillColor #00E5FF)
    const mx = fp.x + (tp.x - fp.x) * 0.6;
    const my = fp.y + (tp.y - fp.y) * 0.6;
    const angle = Math.atan2(tp.y - fp.y, tp.x - fp.x);
    ctx.fillStyle = SIM_CYAN;
    ctx.beginPath();
    ctx.moveTo(mx + 7 * Math.cos(angle), my + 7 * Math.sin(angle));
    ctx.lineTo(mx - 5 * Math.cos(angle - 0.5), my - 5 * Math.sin(angle - 0.5));
    ctx.lineTo(mx - 5 * Math.cos(angle + 0.5), my - 5 * Math.sin(angle + 0.5));
    ctx.closePath();
    ctx.fill();
  }

  // 8. Aim point markers — HoleViewer: #00E5FF, 24px, bold numbered, 2px white border
  for (let i = 0; i < aimPoints.length; i++) {
    const p = proj.project(aimPoints[i].position);
    drawCircleMarker(ctx, p.x, p.y, String(i + 1), SIM_CYAN, markerR);
  }

  // 9. Tee marker — HoleViewer: #3B82F6, bold 11px, "T"
  const teeP = proj.project(hole.tee);
  drawCircleMarker(ctx, teeP.x, teeP.y, 'T', '#3B82F6', markerR);

  // 10. Pin marker — HoleViewer: #EF4444, bold 11px, "P"
  const pinP = proj.project(hole.pin);
  drawCircleMarker(ctx, pinP.x, pinP.y, 'P', '#EF4444', markerR);

  return canvas.toDataURL('image/png');
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderHeader(doc: jsPDF, plan: GamePlan): number {
  let y = MARGIN;

  // Dark header bar — use forest green (matches app header)
  doc.setFillColor(...C.forest);
  doc.rect(0, 0, PAGE_WIDTH, 72, 'F');

  // Course name
  setFont(doc, 'bold', 18, C.white);
  doc.text(plan.courseName, MARGIN, 30);

  // Subtitle
  const teeLabel = plan.teeBox.charAt(0).toUpperCase() + plan.teeBox.slice(1);
  setFont(doc, 'normal', 9, C.sage);
  doc.text(`${teeLabel} Tees  |  ${plan.date}`, MARGIN, 48);

  y = 88;

  // Summary row
  setFont(doc, 'bold', 22, C.turf);
  doc.text(plan.totalExpected.toFixed(1), MARGIN, y);
  setFont(doc, 'normal', 9, C.textMuted);
  doc.text('Expected', MARGIN, y + 13);

  const col2 = MARGIN + 90;
  setFont(doc, 'bold', 14, C.textDark);
  doc.text(`${plan.totalPlaysLike}`, col2, y);
  setFont(doc, 'normal', 9, C.textMuted);
  doc.text('Plays-Like Yds', col2, y + 13);

  if (plan.keyHoles.length > 0) {
    const col3 = MARGIN + 210;
    setFont(doc, 'bold', 14, C.yellow);
    doc.text(plan.keyHoles.join(', '), col3, y);
    setFont(doc, 'normal', 9, C.textMuted);
    doc.text('Key Holes', col3, y + 13);
  }

  // Score distribution bar — use app score pill colors
  y += 30;
  const bd = plan.breakdown;
  const segments: { label: string; pct: number; color: RGB }[] = [
    { label: 'Birdie', pct: bd.birdie, color: C.green },
    { label: 'Par', pct: bd.par, color: C.par },
    { label: 'Bogey', pct: bd.bogey, color: C.bogey },
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

  // Legend
  y += barHeight + 10;
  let lx = MARGIN;
  setFont(doc, 'normal', 7, C.textMuted);
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
  setFont(doc, 'bold', 10, C.textMuted);
  doc.text(label, MARGIN, y + 10);
  y += 18;
  return y;
}

function measureCard(doc: jsPDF, hole: HolePlan, hasMap: boolean): number {
  const PAD = 10;
  const textWidth = hasMap ? CONTENT_WIDTH - MAP_SIZE - MAP_GAP - 14 : CONTENT_WIDTH - 36;
  let h = 42;
  if (hole.strategy.aimPoints.length > 0) {
    setFont(doc, 'normal', 7.5, C.textMuted);
    for (const ap of hole.strategy.aimPoints) {
      const carryPart = ap.carry > 0 ? `${ap.carry}y${ap.carryNote ? ` (${ap.carryNote})` : ''} - ` : '';
      const tipText = `${ap.shotNumber}. ${carryPart}${ap.tip}`;
      const lines = doc.splitTextToSize(tipText, textWidth);
      h += lines.length * 10;
    }
    h += 2;
  }
  const textH = h + PAD;
  return hasMap ? Math.max(textH, MAP_SIZE + PAD) : textH;
}

function renderHoleCard(
  doc: jsPDF,
  hole: HolePlan,
  y: number,
  mapDataUrl: string | null,
): number {
  const hasMap = mapDataUrl !== null;
  // Use app's accent colors (matches GamePlanView BORDER_COLORS)
  const accentColor: RGB =
    hole.colorCode === 'green' ? C.green :
    hole.colorCode === 'yellow' ? C.yellow : C.red;
  const cardH = measureCard(doc, hole, hasMap);

  y = ensureSpace(doc, y, cardH + 4);

  // Card background with border
  drawCard(doc, y, cardH);

  // Color accent bar (left edge) — matches website borderLeftColor
  doc.setFillColor(...accentColor);
  doc.roundedRect(MARGIN, y, 4, cardH, 2, 2, 'F');
  doc.rect(MARGIN + 2, y, 2, cardH, 'F');

  // Map image
  if (hasMap) {
    const mapX = MARGIN + 8;
    const mapY = y + (cardH - MAP_SIZE) / 2;
    doc.addImage(mapDataUrl, 'PNG', mapX, mapY, MAP_SIZE, MAP_SIZE);
  }

  // Text positioning
  const textLeft = hasMap ? MARGIN + 8 + MAP_SIZE + MAP_GAP : MARGIN + 14;
  const textWidth = hasMap ? CONTENT_WIDTH - MAP_SIZE - MAP_GAP - 14 : CONTENT_WIDTH - 36;

  // Row 1: Hole # + meta + xS
  let ry = y + 14;

  // Hole number badge — matches website's colored circle
  const badgeR = 8;
  doc.setFillColor(...accentColor);
  doc.circle(textLeft + badgeR, ry - 3, badgeR, 'F');
  setFont(doc, 'bold', 8, C.white);
  const numStr = String(hole.holeNumber);
  const numW = doc.getTextWidth(numStr);
  doc.text(numStr, textLeft + badgeR - numW / 2, ry - 1);

  // Meta text
  setFont(doc, 'normal', 8.5, C.textMuted);
  let meta = `Par ${hole.par}  ·  ${hole.yardage}y`;
  if (hole.playsLikeYardage) meta += ` (plays ${hole.playsLikeYardage})`;
  doc.text(meta, textLeft + badgeR * 2 + 6, ry);

  // xS — use accent color (matches website text-primary styling)
  const xsText = `${hole.strategy.expectedStrokes.toFixed(1)}`;
  setFont(doc, 'bold', 11, accentColor);
  const xsW = doc.getTextWidth(xsText);
  doc.text(xsText, PAGE_WIDTH - MARGIN - 10 - xsW, ry);

  // Row 2: Strategy name + club sequence
  ry += 16;
  setFont(doc, 'bold', 8.5, C.turf);
  doc.text(hole.strategy.strategyName, textLeft, ry);

  const nameW = doc.getTextWidth(hole.strategy.strategyName);
  const clubSeq = hole.strategy.clubs.map((c) => c.clubName).join('  >  ');
  setFont(doc, 'normal', 8, C.textFaint);
  const maxClubW = textWidth - nameW - 20;
  if (maxClubW > 30) {
    doc.text(clubSeq, textLeft + nameW + 10, ry, { maxWidth: maxClubW });
  }

  // Row 3+: Caddy tips
  if (hole.strategy.aimPoints.length > 0) {
    ry += 14;
    for (const ap of hole.strategy.aimPoints) {
      const carryPart = ap.carry > 0 ? `${ap.carry}y${ap.carryNote ? ` (${ap.carryNote})` : ''} - ` : '';
      // Shot number in medium weight
      setFont(doc, 'bold', 7.5, C.textMedium);
      doc.text(`${ap.shotNumber}.`, textLeft, ry);
      // Carry + tip in muted
      setFont(doc, 'normal', 7.5, C.textMuted);
      const tipText = `${carryPart}${ap.tip}`;
      const lines = doc.splitTextToSize(tipText, textWidth - 12);
      doc.text(lines, textLeft + 12, ry);
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

  // Paint first page background
  doc.setFillColor(...C.surface);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');

  // Pre-render all hole maps
  const holeMaps = new Map<number, string>();
  if (courseHoles) {
    for (const holePlan of plan.holes) {
      const courseHole = courseHoles.find((h) => h.holeNumber === holePlan.holeNumber);
      if (courseHole && holePlan.strategy.aimPoints.length > 0) {
        try {
          holeMaps.set(holePlan.holeNumber, renderHoleMapCanvas(courseHole, holePlan.strategy.aimPoints));
        } catch {
          // Skip map on error
        }
      }
    }
  }

  let y = renderHeader(doc, plan);

  const totalHoles = plan.holes.length;
  for (let i = 0; i < totalHoles; i++) {
    if (totalHoles > 9 && i === 0) y = renderNineHeader(doc, 'FRONT NINE', y);
    if (totalHoles > 9 && i === 9) y = renderNineHeader(doc, 'BACK NINE', y);

    const mapUrl = holeMaps.get(plan.holes[i].holeNumber) ?? null;
    y = renderHoleCard(doc, plan.holes[i], y, mapUrl);
  }

  doc.save(`${plan.courseName.replace(/\s+/g, '_')}_GamePlan.pdf`);
}
