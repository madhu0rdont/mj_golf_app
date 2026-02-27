import jsPDF from 'jspdf';
import type { GamePlan } from './game-plan';

const MARGIN = 20;
const PAGE_WIDTH = 595.28; // A4
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const HOLES_PER_PAGE = 9;

const COLORS = {
  green: [64, 145, 108] as [number, number, number],
  yellow: [212, 168, 67] as [number, number, number],
  red: [231, 111, 81] as [number, number, number],
  text: [30, 30, 30] as [number, number, number],
  muted: [120, 120, 120] as [number, number, number],
  border: [200, 200, 200] as [number, number, number],
};

export function exportGamePlanPDF(plan: GamePlan): void {
  const doc = new jsPDF('portrait', 'pt', 'a4');
  let y = MARGIN;

  // --- Header ---
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.text);
  doc.text(plan.courseName, MARGIN, y + 18);
  y += 28;

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.muted);
  doc.text(
    `${plan.teeBox.charAt(0).toUpperCase() + plan.teeBox.slice(1)} Tees  ·  ${plan.mode === 'scoring' ? 'Scoring' : 'Safe'} Mode  ·  ${plan.date}`,
    MARGIN,
    y,
  );
  y += 20;

  // --- Summary ---
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.text);
  doc.text(`Expected Total: ${plan.totalExpected.toFixed(1)}`, MARGIN, y);
  y += 16;

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text(`Plays-Like Total: ${plan.totalPlaysLike} yds`, MARGIN, y);
  y += 12;

  if (plan.keyHoles.length > 0) {
    doc.text(`Key Holes: ${plan.keyHoles.join(', ')}`, MARGIN, y);
    y += 12;
  }

  y += 10;

  // --- Divider ---
  doc.setDrawColor(...COLORS.border);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 15;

  // --- Per-hole cards ---
  for (let i = 0; i < plan.holes.length; i++) {
    // New page every HOLES_PER_PAGE
    if (i > 0 && i % HOLES_PER_PAGE === 0) {
      doc.addPage();
      y = MARGIN;
    }

    const hole = plan.holes[i];
    const cardHeight = 58;

    // Color-coded left bar
    const color = COLORS[hole.colorCode];
    doc.setFillColor(...color);
    doc.rect(MARGIN, y, 4, cardHeight, 'F');

    // Hole number + par
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.text);
    doc.text(`#${hole.holeNumber}`, MARGIN + 12, y + 14);

    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text(`Par ${hole.par}  ·  ${hole.yardage} yds`, MARGIN + 40, y + 14);

    if (hole.playsLikeYardage) {
      doc.text(`(plays ${hole.playsLikeYardage})`, MARGIN + 130, y + 14);
    }

    // Strategy
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.text);
    doc.text(hole.strategy.strategyName, MARGIN + 12, y + 28);

    const clubSeq = hole.strategy.clubs.map((c) => c.clubName).join(' → ');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text(clubSeq, MARGIN + 12, y + 40, { maxWidth: CONTENT_WIDTH - 100 });

    // Expected score
    doc.setFontSize(10);
    doc.setTextColor(...color);
    doc.text(`${hole.strategy.expectedStrokes.toFixed(1)} xS`, PAGE_WIDTH - MARGIN - 50, y + 14);

    // Tips
    const tips: string[] = [];
    if (hole.carryToAvoid) tips.push(`Carry: ${hole.carryToAvoid}y`);
    if (hole.missSide) tips.push(hole.missSide);
    if (tips.length > 0) {
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.muted);
      doc.text(tips.join('  ·  '), MARGIN + 12, y + 52);
    }

    y += cardHeight + 6;
  }

  doc.save(`${plan.courseName.replace(/\s+/g, '_')}_GamePlan.pdf`);
}
