import jsPDF from 'jspdf';
import type { GamePlan, HolePlan } from './game-plan';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
const MARGIN = 28;
const PAGE_WIDTH = 595.28; // A4 portrait
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

type RGB = [number, number, number];
const C = {
  green: [46, 125, 50] as RGB,     // birdie opportunity
  yellow: [191, 155, 48] as RGB,   // standard hole
  red: [198, 78, 56] as RGB,       // blowup risk
  text: [28, 28, 28] as RGB,
  muted: [110, 110, 110] as RGB,
  light: [160, 160, 160] as RGB,
  bg: [247, 247, 245] as RGB,      // card fill
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
  const modeLabel = plan.mode === 'scoring' ? 'Scoring' : 'Safe';
  setFont(doc, 'normal', 9, [190, 190, 190] as RGB);
  doc.text(`${teeLabel} Tees  |  ${modeLabel} Mode  |  ${plan.date}`, MARGIN, 48);

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

function measureCard(doc: jsPDF, hole: HolePlan): number {
  const PAD = 10;
  let h = 42; // header row (hole # + strategy name) + club row
  // Measure each tip's wrapped height
  if (hole.strategy.aimPoints.length > 0) {
    setFont(doc, 'normal', 7.5, C.muted);
    for (const ap of hole.strategy.aimPoints) {
      const carryPart = ap.carry > 0 ? `${ap.carry}y${ap.carryNote ? ` (${ap.carryNote})` : ''} - ` : '';
      const tipText = `${ap.shotNumber}. ${carryPart}${ap.tip}`;
      const lines = doc.splitTextToSize(tipText, CONTENT_WIDTH - 36);
      h += lines.length * 10;
    }
    h += 2; // gap before tips
  }
  return h + PAD;
}

function renderHoleCard(doc: jsPDF, hole: HolePlan, y: number): number {
  const color = C[hole.colorCode];
  const cardH = measureCard(doc, hole);

  y = ensureSpace(doc, y, cardH + 4);

  // Card background
  drawCard(doc, y, cardH);

  // Color accent bar (left edge)
  doc.setFillColor(...color);
  doc.roundedRect(MARGIN, y, 4, cardH, 2, 2, 'F');
  // Overlap the right side of the rounded rect to make a flat right edge
  doc.rect(MARGIN + 2, y, 2, cardH, 'F');

  const lx = MARGIN + 14; // text left

  // Row 1: Hole # (bold) | Par · Yds (plays X) | xS right-aligned
  let ry = y + 14;

  setFont(doc, 'bold', 12, C.text);
  doc.text(`#${hole.holeNumber}`, lx, ry);

  const holeNumW = doc.getTextWidth(`#${hole.holeNumber}`);
  setFont(doc, 'normal', 8.5, C.muted);
  let meta = `Par ${hole.par}  |  ${hole.yardage} yds`;
  if (hole.playsLikeYardage) meta += ` (plays ${hole.playsLikeYardage})`;
  doc.text(meta, lx + holeNumW + 8, ry);

  // xS badge right-aligned
  const xsText = `${hole.strategy.expectedStrokes.toFixed(1)} xS`;
  setFont(doc, 'bold', 10, color);
  const xsW = doc.getTextWidth(xsText);
  doc.text(xsText, PAGE_WIDTH - MARGIN - 10 - xsW, ry);

  // Row 2: Strategy name (bold) + club sequence
  ry += 16;
  setFont(doc, 'bold', 8.5, C.text);
  doc.text(hole.strategy.strategyName, lx, ry);

  const nameW = doc.getTextWidth(hole.strategy.strategyName);
  const clubSeq = hole.strategy.clubs.map((c) => c.clubName).join('  >  ');
  setFont(doc, 'normal', 8, C.light);
  doc.text(clubSeq, lx + nameW + 10, ry, { maxWidth: CONTENT_WIDTH - nameW - 80 });

  // Row 3+: Caddy tips
  if (hole.strategy.aimPoints.length > 0) {
    ry += 14;
    setFont(doc, 'normal', 7.5, C.muted);
    for (const ap of hole.strategy.aimPoints) {
      const carryPart = ap.carry > 0 ? `${ap.carry}y${ap.carryNote ? ` (${ap.carryNote})` : ''} - ` : '';
      const tipText = `${ap.shotNumber}. ${carryPart}${ap.tip}`;
      const lines = doc.splitTextToSize(tipText, CONTENT_WIDTH - 36);
      doc.text(lines, lx, ry);
      ry += lines.length * 10;
    }
  }

  return y + cardH + 4;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function exportGamePlanPDF(plan: GamePlan): void {
  const doc = new jsPDF('portrait', 'pt', 'a4');

  let y = renderHeader(doc, plan);

  for (let i = 0; i < plan.holes.length; i++) {
    // Front/Back nine headers
    if (i === 0) y = renderNineHeader(doc, 'FRONT NINE', y);
    if (i === 9) y = renderNineHeader(doc, 'BACK NINE', y);

    y = renderHoleCard(doc, plan.holes[i], y);
  }

  doc.save(`${plan.courseName.replace(/\s+/g, '_')}_GamePlan.pdf`);
}
