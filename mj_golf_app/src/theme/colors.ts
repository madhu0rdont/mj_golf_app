// Design system color constants for Recharts/SVG props
// Mirrors CSS custom properties defined in index.css @theme

export const THEME = {
  primary: '#2D6A4F',
  primaryLight: '#40916C',
  primaryPale: '#D8F3DC',
  gold: '#D4A843',
  goldLight: '#F5E6C8',
  goldDark: '#8A6D2B',
  coral: '#E76F51',
  coralLight: '#FDEAE4',
  softBlue: '#7EB8DA',
  textDark: '#1A1A2E',
  textMedium: '#4A4A5A',
  textMuted: '#9B9B9B',
  textFaint: '#C5C5C5',
  surface: '#F3F0EB',
  card: '#FFFFFF',
  border: '#E8E4DF',
  borderLight: '#F0EDE8',

  // Flight visualizer (fairway green)
  sky: '#1B4332',
  skyGrid: '#2D6A4F',
  skyGround: '#40916C',
  skyLabel: '#95D5B2',
  grass: '#1B4332',
  grassGrid: '#2D6A4F',
  grassCenter: '#40916C',
  grassLabel: '#95D5B2',

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
    straight: '#2D6A4F',
    draw: '#2563EB',
    fade: '#9333EA',
    hook: '#DC2626',
    slice: '#EA580C',
    pull: '#CA8A04',
    push: '#0891B2',
  } as Record<string, string>,

  // Recharts axis/tooltip
  axisText: '#9B9B9B',
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#E8E4DF',
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
