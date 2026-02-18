# MJ Golf

Club Distances & Yardage Book PWA for Foresight GC4 launch monitor.

## Features

### Club Bag Management
- Default 14-club bag (Driver through Putter)
- Full CRUD: add, edit, delete clubs with brand, model, loft, shaft, flex
- Drag-to-reorder with touch-friendly sorting
- Category-colored badges (Driver/Wood/Hybrid/Iron/Wedge/Putter)

### Practice Session Logging (3 ingestion methods)
- **Photo Capture**: Photograph GC4 screen, AI extracts shot data via Claude Vision API
- **CSV Import**: Upload Foresight FSX/app CSV exports with auto column mapping
- **Manual Entry**: Shot-by-shot form with expandable advanced fields

### Session Analytics
- Avg/median/max/min carry, dispersion range, standard deviation
- Launch data averages (ball speed, club speed, launch angle, spin rate)
- Shot shape classification (straight/draw/fade/hook/slice/pull/push)
- Shot quality classification (pure/good/acceptable/mishit via statistical deviation)
- Pie chart for shape distribution, bar chart for quality breakdown

### Yardage Book (Recency-Weighted)
- Exponential decay weighting with 30-day half-life
- Book carry/total numbers reflect your CURRENT game, not historical average
- Freshness indicators: Fresh (<14d), Aging (14-45d), Stale (>45d)
- Per-club detail view with carry-over-time charts and session history

### Gapping Analysis
- Horizontal bar chart showing all clubs sorted by carry distance
- Gap annotations between clubs (>15 yard gaps highlighted)
- Category color coding

### Course Management
- Enter target yardage, get instant club recommendations
- Confidence levels: Great/OK/Stretch based on carry match + freshness + dispersion
- Color-coded recommendation cards with delta indicators

### Data Management
- All data stored locally on-device (IndexedDB via Dexie.js)
- JSON export/import for backup and portability
- Works fully offline (except photo extraction which needs API)
- PWA: installable on mobile home screen

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 + TypeScript |
| Bundler | Vite 7 |
| PWA | vite-plugin-pwa (Workbox) |
| CSS | Tailwind CSS v4 (mobile-first, dark theme) |
| Routing | react-router v7 (library mode) |
| Local DB | Dexie.js + dexie-react-hooks |
| Charts | Recharts |
| AI Vision | Claude API (claude-sonnet-4-5) |
| Icons | lucide-react |
| Drag/Drop | @dnd-kit/core + sortable |

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:5173 on your phone or desktop.

## Build & Deploy

```bash
npm run build
npm run preview
```

The `dist/` folder is a static PWA that can be deployed to any static host (Vercel, Netlify, GitHub Pages, etc.).

## Setting Up Photo Extraction

1. Go to Settings in the app
2. Enter your Claude API key (get one at https://console.anthropic.com)
3. The key is stored locally in your browser, never on any server

## Project Structure

```
src/
├── db/          # Dexie database schema + seed data + backup
├── models/      # TypeScript interfaces (Club, Session, Shot, etc.)
├── hooks/       # React hooks (useClubs, useSessions, useYardageBook, etc.)
├── services/    # Business logic (claude-vision, csv-parser, stats, shot-classifier)
├── pages/       # 14 route pages
├── components/  # UI components (layout, clubs, sessions, yardage, charts, course, ui)
├── context/     # SettingsContext (API key, units)
└── utils/       # Validation, formatting, constants
```
