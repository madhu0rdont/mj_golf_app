// Design system color constants for Recharts/SVG props
// Mirrors CSS custom properties defined in index.css @theme

export const THEME = {
  primary: '#2A5C40',
  primaryLight: '#3A7A55',
  primaryPale: '#e8f5e4',
  gold: '#B8871E',
  goldLight: '#D4A030',
  goldDark: '#8A6D2B',
  coral: '#B83228',
  softBlue: '#7EB8DA',
  textDark: '#0E1A12',
  textMedium: '#2A3D30',
  textMuted: '#9AAA9C',
  textFaint: '#5C6E60',
  surface: '#F2EDE3',
  card: 'rgba(255,255,255,0.55)',
  cardSolid: '#FFFFFF',
  border: '#EBE5D8',
  borderLight: '#F0EBE0',

  // Named palette
  forest: '#1A3D2C',
  turf: '#2A5C40',
  fairway: '#3A7A55',
  ink: '#0E1A12',
  inkMid: '#2A3D30',
  inkLight: '#5C6E60',
  inkFaint: '#9AAA9C',
  linen: '#F2EDE3',
  parchment: '#EBE5D8',

  // Flight visualizer (fairway green)
  sky: '#1A3D2C',
  skyGrid: '#2A5C40',
  skyGround: '#3A7A55',
  skyLabel: '#9AAA9C',
  grass: '#1A3D2C',
  grassGrid: '#2A5C40',
  grassCenter: '#3A7A55',
  grassLabel: '#9AAA9C',

  // Category colors (for GappingChart and ClubCard)
  category: {
    driver: '#DC2626',
    wood: '#EA580C',
    hybrid: '#CA8A04',
    iron: '#2563EB',
    wedge: '#9333EA',
    putter: '#6B7280',
  } as Record<string, string>,

  // Shot shape colors (for ShotShapePie)
  shotShape: {
    straight: '#2A5C40',
    draw: '#2563EB',
    fade: '#9333EA',
    hook: '#DC2626',
    slice: '#EA580C',
    pull: '#CA8A04',
    push: '#0891B2',
  } as Record<string, string>,

  // Recharts axis/tooltip
  axisText: '#9AAA9C',
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#EBE5D8',
} as const;

/** Distinct colors for multi-club charts. Clubs assigned by sort-order index. */
export const CLUB_COLORS = [
  '#E63946', // red
  '#F4A261', // orange
  '#E9C46A', // yellow
  '#2A9D8F', // teal
  '#4CC9F0', // sky blue
  '#7209B7', // purple
  '#F72585', // magenta
  '#4361EE', // royal blue
  '#80ED99', // mint
  '#FF6B6B', // coral
] as const;
