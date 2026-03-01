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

## Changelog

### v1.2.0 — Security Hardening & Robustness
- Bcrypt password hashing with timing-safe comparison
- CSRF protection via custom header check on all mutating requests
- Rate limiting: login (5/15min), photo extraction (30/hr), hazard detection (50/hr)
- Session secret required in production (fatal exit if missing)
- Zod input validation on all critical API routes (clubs, sessions, backup, extract)
- React Error Boundary for graceful crash recovery
- Health check endpoints (`/health`, `/ready`) for Railway monitoring

### v1.1.0 — Navigation & Home Redesign
- Redesigned home page with dedicated Play and Practice sections
- New `/play` and `/practice` pages with tool links
- Simplified hamburger menu: 6 items in two groups (primary + utility) with divider
- Server-side auto-regeneration of game plans with history tracking
- Removed About page and dead BottomNav code

### v1.0.0 — Course Management Polish
- Dispersion-aware aim points on course maps with bias compensation
- Descriptive caddy tips identifying hazards by side, type, and distance
- Handicap data, multi-tee scorecards, and rich prose hole descriptions
- Course grid selection with logos (Claremont, Presidio)
- Course Management section in How It Works guide
- Server route hardening: error handling, transactions, validation, and tests
- Cleaned up unused code, dead routes, and stale theme colors

### v0.9.0 — Course Strategy
- Course Strategy module with KML import and PostgreSQL tables
- Hazard Mapper: satellite imagery with Claude Vision hazard detection
- Strategy Planner: satellite hole viewer with hazard overlays
- Monte Carlo simulation visualization on strategy maps
- Strategy Optimizer: named strategies, GPS simulation, score distributions
- Game Plan Generator with per-shot caddy tips
- Admin page redesign with 3-tab layout (Course Editor, Hazard Mapper, Strategy)
- Auto-import shared hazards from adjacent holes
- Editable hazard names and per-type penalty configuration

### v0.8.0 — Monte Carlo & How It Works
- Monte Carlo club recommendations with confidence intervals
- Proximity-based putting model replacing flat +2 putts
- Linear How It Works guide with SVG diagrams (replaced FAQ)
- Carry-over-time trend chart with book carry reference line
- Shot shape filter for yardage book with per-club preferred shape
- Client-side photo compression before Claude API upload
- Hamburger menu navigation drawer (replaced bottom nav)
- Imputed dispersion ellipses and offline column on yardage details

### v0.7.0 — Practice Modes
- Wedge distance practice: full/shoulder/hip swing positions in matrix grid
- Interleaved practice: simulated 9/18-hole rounds on the range
- Smart club recommendations with grip-down and wedge swing positions
- Scoring zone analysis (reaching within 100 yards)
- Iterative physics distance model with per-shot aim at hole

### v0.6.0 — Yardage Book Tabs & Physics Engine
- 3-tab yardage view: Yardages, Wedge Matrix, Details (each with own URL)
- Inline editing for yardage carry distances
- Physics-based imputation from carry + loft using PGA Tour Trackman reference data
- Manual carry values anchor imputed distances
- Collapsible flight charts on Details tab

### v0.5.0 — Server Migration
- Migrated from IndexedDB/Dexie to PostgreSQL + Express 5 API
- Server-side Claude API key handling for security
- Password login with server-side sessions (connect-pg-simple)
- SWR (stale-while-revalidate) data fetching
- JSON backup import/export over API

### v0.4.0 — Simulator Data & Yardage Book v2
- GC4 simulator data seeding from spreadsheet
- Sessions list page with edit and delete
- Redesigned Yardage Book with multi-club Trackman view and mishit toggle
- Distance imputation for clubs without shot data
- Database seeding from exported JSON backup on fresh boot

### v0.3.0 — Theme Redesign & Session Summary v2
- Left-handed support for shot shape classification
- Warm light FlavorFit design system (migrated from dark theme)
- Hero metrics grid with 7 stat cards and Trackman-style data table
- Edit session modal for club and date changes
- Mishit toggle filtering for metrics, charts, and table rows
- Side-by-side trajectory and dispersion charts with fairway green backgrounds
- Shape, Grade, Descent Angle, and Max Height columns in Trackman table

### v0.2.0 — Flight Charts & Testing
- Comprehensive test suite: 150 unit tests + 72 E2E tests
- Session flight visualizer with trajectory and dispersion charts

### v0.1.0 — Foundation
- PWA shell with offline support
- Club bag management: 14-club default bag, full CRUD, drag-to-reorder
- Manual session entry with real-time shot classification
- Session summary with stats, charts, and quality analysis
- AI photo extraction via Claude Vision API (GC4 screen capture)
- Yardage book with recency-weighted engine (30-day half-life) and gapping analysis
- CSV import with auto column mapping (Foresight FSX format)
- Course management with data-driven club recommendations
- Settings, dashboard, data export/import

## Documentation

See the [Wiki](https://github.com/madhu0rdont/mj_golf_app/wiki) for detailed documentation on architecture, data models, the yardage book engine, physics imputation math, interleaved practice scoring, and more.
