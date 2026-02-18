# MJ Golf

Club Distances & Yardage Book PWA for Foresight GC4 launch monitor.

## Features

- **Club Bag Management** — 14-club bag with full customization
- **Practice Session Logging** — Photo (AI extraction), CSV import, or manual entry
- **Session Analytics** — Stats, charts, shot shape & quality classification
- **Yardage Book** — Recency-weighted carry distances with freshness indicators
- **Gapping Analysis** — Visualize distance gaps and overlaps between clubs
- **Course Management** — Data-driven club recommendations per target yardage

## Tech Stack

- React 19 + TypeScript
- Vite + PWA (installable, works offline)
- Tailwind CSS v4 (mobile-first)
- Dexie.js (IndexedDB — all data on-device)
- Recharts (charts & visualizations)
- Claude Vision API (photo extraction from GC4 screenshots)

## Getting Started

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```
