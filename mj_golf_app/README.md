# MJ Golf

A full-stack golf performance tracking app built for the Foresight GC4 launch monitor. Log practice sessions, build a recency-weighted yardage book, play simulated rounds on the range, and get smart club recommendations backed by your own data.

## Features

### Practice Modes

- **Block Practice** — Single-club sessions via photo capture (Claude Vision AI), CSV import, or manual entry. Full Trackman-style metrics: carry, total, ball speed, launch angle, spin, apex, descent, offline.

- **Interleaved Practice** — Play a simulated 9 or 18-hole round on the range. The app generates randomized holes (par 3–5), tracks remaining distance with an iterative physics model, recommends clubs (including grip-down and partial swing options), and produces a full scorecard with scoring zone analysis.

- **Wedge Distance Practice** — Test your wedges across three swing positions (full, shoulder, hip) in a matrix grid. Builds a distance ladder that feeds into club recommendations.

### Yardage Book

- **Recency-weighted averages** — 30-day half-life exponential decay so your book reflects your current game, not last year's numbers
- **Physics-based imputation** — Clubs without shot data get estimated flight profiles by scaling PGA Tour reference data to your carry distance and loft
- **Interleaved full shots** — Shots marked as "full" during simulated rounds feed back into your book numbers
- **Gapping analysis** — Visual bar chart showing distance gaps and overlaps between clubs
- **Wedge matrix** — Distance grid for each wedge at each swing position with manual overrides
- **Freshness indicators** — Fresh (<14d), Aging (14–45d), Stale (>45d)

### Session Summary

- 7 hero stat cards (carry, total, speed, launch, descent, peak height, offline)
- Side-by-side trajectory and dispersion charts (SVG with dark fairway backgrounds)
- Trackman data table with mishit toggle
- Previous session comparison deltas
- Interleaved round scorecard with per-hole shot details and scoring zones
- Edit and delete sessions from the summary page

### Smart Club Recommendations

- **Course mode**: enter a target yardage, get the top 3 clubs ranked by confidence (Great / OK / Stretch)
- **Interleaved practice**: real-time recommendations including grip-down adjustments (~5 yds per inch) and wedge swing positions (full / shoulder / hip)
- Wedge overrides from your actual distance testing take precedence over defaults

### Club Bag Management

- Default 14-club bag seeded on first launch (Driver through Putter)
- Full CRUD with brand, model, loft, shaft, flex
- Drag-to-reorder with touch-friendly sorting
- Category-colored badges

### Data Ingestion

- **AI Photo Extraction** — Photograph the GC4 screen; Claude Vision extracts tabular data server-side
- **CSV Import** — Upload Foresight FSX/app CSV exports with auto column mapping
- **Manual Entry** — Shot-by-shot form with expandable advanced fields and real-time validation

### Shot Classification

- **Shape**: straight / draw / fade / hook / slice / pull / push (from spin axis + offline, handedness-aware)
- **Quality**: pure / good / acceptable / mishit (statistical deviation from session mean, classified per-club for multi-club sessions)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS v4 |
| Data Fetching | SWR (stale-while-revalidate) |
| Server | Express 5, PostgreSQL, connect-pg-simple |
| AI | Claude Vision API (server-side photo extraction) |
| Charts | Recharts + custom SVG (trajectory, dispersion) |
| Testing | Vitest (unit), Playwright (E2E) |
| Deployment | Railway (Express + Postgres) |
| PWA | vite-plugin-pwa (Workbox) |
| Drag/Drop | @dnd-kit/core + sortable |

## Quick Start

```bash
git clone https://github.com/madhu0rdont/mj_golf_app.git
cd mj_golf_app
npm install
```

Create a `.env` file:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/mj_golf
APP_PASSWORD=your_password
SESSION_SECRET=your_secret
```

```bash
npm run dev
```

This starts both the Vite dev server (port 5173) and the Express API (port 3001) concurrently. The database schema auto-migrates and a default 14-club bag is seeded on first run.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend + backend in development |
| `npm run build` | Build client (Vite) + server (tsc) for production |
| `npm start` | Run the production server |
| `npm run test:run` | Run unit tests (Vitest) |
| `npm run test:e2e` | Run E2E tests (Playwright) |
| `npm run test:coverage` | Unit tests with coverage report |
| `npm run lint` | ESLint |

## Project Structure

```
src/                          # React frontend
├── pages/                    # 18 route pages
├── components/               # UI components by domain
│   ├── flight/               #   Trajectory + dispersion SVG charts
│   ├── interleaved/          #   Scorecard, shot input, summary
│   ├── wedge-practice/       #   Wedge matrix summary
│   ├── summary/              #   Hero stats, Trackman table
│   ├── yardage/              #   Book rows, freshness, gapping
│   └── ui/                   #   Button, Modal, Input, Select
├── hooks/                    # SWR data hooks
├── services/                 # Business logic
│   ├── interleaved-scoring   #   Distance model, scoring zones
│   ├── course-generator      #   Random hole generation
│   ├── impute                #   Physics-based imputation
│   ├── stats                 #   Statistical aggregates
│   ├── shot-classifier       #   Shape + quality classification
│   └── csv-parser            #   CSV column mapping
├── models/                   # TypeScript interfaces
└── context/                  # Settings context

server/                       # Express backend
├── index.ts                  # App setup, auth middleware, SPA serving
├── routes/                   # API routes
│   ├── auth                  #   Login / logout / check
│   ├── clubs                 #   CRUD + reorder
│   ├── sessions              #   CRUD + shot classification
│   ├── shots                 #   Global shot queries
│   ├── extract               #   Claude Vision AI
│   ├── backup                #   JSON export / import
│   └── wedge-overrides       #   Wedge distance overrides
├── migrate.ts                # PostgreSQL schema migrations
└── seed.ts                   # Default club bag seeding

e2e/                          # Playwright E2E tests
src/services/__tests__/       # Vitest unit tests
```

## Deployment

Deployed on **Railway** with auto-provisioned PostgreSQL:

1. Connect the GitHub repo to Railway
2. Set environment variables: `DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET`
3. Build: `npm run build` | Start: `npm start`

The Express server serves both the REST API and the built SPA from the `dist/` folder.

## Documentation

See the [Wiki](https://github.com/madhu0rdont/mj_golf_app/wiki) for detailed documentation on architecture, data models, the yardage book engine, physics imputation math, interleaved practice scoring, and more.
