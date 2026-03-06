# FlagstIQ

> A full-stack golf performance tracking app built for the Foresight GC4 launch monitor. Log practice sessions, build a recency-weighted yardage book, play simulated rounds on the range, and get AI-powered course strategy backed by your own data.

![Version](https://img.shields.io/badge/version-1.7.2-green)

![Railway](https://img.shields.io/badge/deployed-Railway-blueviolet)

![License](https://img.shields.io/badge/license-MIT-blue)---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Scripts](#scripts)
- [Project structure](#project-structure)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Changelog](#changelog)

---

## Features

### 🏌️ Practice modes

| Mode | Description |
| --- | --- |
| Block Practice | Single-club sessions via AI photo capture (Claude Vision), CSV import, or manual entry. Full Trackman-style metrics: carry, total, ball speed, launch angle, spin, apex, descent, offline. |
| Interleaved Practice | Simulated 9 or 18-hole rounds on the range. Randomized holes (par 3–5), iterative physics distance model, real-time club recommendations, and a full scorecard with scoring zone analysis. |
| Wedge Distance Practice | Test wedges across three swing positions (full, shoulder, hip) in a matrix grid. Builds a distance ladder that feeds directly into club recommendations. |

### 📖 Yardage book

- **Recency-weighted averages** — 30-day half-life exponential decay keeps your book current
- **Physics-based imputation** — Clubs without shot data get estimated flight profiles scaled from PGA Tour Trackman reference data
- **Gapping analysis** — Visual bar chart showing distance gaps and overlaps between clubs
- **Wedge matrix** — Distance grid per wedge at each swing position with manual overrides
- **Freshness indicators** — Fresh (&lt;14d) · Aging (14–45d) · Stale (&gt;45d)

### 🗺️ Course strategy

- **DP/MDP optimizer** — Dynamic Programming (Markov Decision Process) computes optimal shot-by-shot strategies per hole across three modes: Scoring, Safe, and Aggressive
- **Game plan PDF** — Printable hole-by-hole game plan with tactical maps, caddy tips, and score distributions
- **Hazard mapper** — Satellite imagery with KML import and hazard overlays
- **Monte Carlo simulation** — 2,000 trials per hole for accurate score distribution estimates
- **Estimated handicap** — Computed from cached scoring plans using course rating and slope

### 📊 Session summary

- 7 hero stat cards (carry, total, speed, launch, descent, peak height, offline)
- Side-by-side trajectory and dispersion charts (SVG with fairway backgrounds)
- Trackman data table with mishit toggle and previous session comparison deltas
- Shot shape classification: straight / draw / fade / hook / slice / pull / push
- Shot quality grading: pure / good / acceptable / mishit

### 🎒 Club bag management

- Default 14-club bag seeded on first launch (Driver through Putter)
- Full CRUD with brand, model, loft, shaft, and flex
- Drag-to-reorder with touch-friendly sorting
- Category-colored badges

### 📥 Data ingestion

- **AI Photo Extraction** — Photograph the GC4 screen; Claude Vision extracts tabular data server-side
- **CSV Import** — Upload Foresight FSX/app exports with auto column mapping
- **Manual Entry** — Shot-by-shot form with expandable advanced fields and real-time validation

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS v4 |
| Data fetching | SWR (stale-while-revalidate) |
| Server | Express 5, PostgreSQL, connect-pg-simple |
| AI | Claude Vision API (server-side photo extraction) |
| Charts | Recharts + custom SVG (trajectory, dispersion) |
| Testing | Vitest (unit), Playwright (E2E) |
| Deployment | Railway (Express + Postgres) |
| PWA | vite-plugin-pwa (Workbox) |
| Drag/drop | @dnd-kit/core + sortable |

---

## Quick start

### Prerequisites

- Node.js 20+
- PostgreSQL (or use Railway’s auto-provisioned instance)

### Install

```bash
git clone https://github.com/madhu0rdont/flagstiq.git
cd flagstiq
npm install
```

### Configure environment

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/flagstiq
APP_PASSWORD=your_password
SESSION_SECRET=your_secret
```

> **Optional:** Set `ANTHROPIC_API_KEY` to enable AI photo extraction and course strategy features.

### Run

```bash
npm run dev
```

This starts both the Vite dev server (port **5173**) and the Express API (port **3001**) concurrently. The database schema auto-migrates and a default 14-club bag is seeded on first run.

---

## Scripts

| Command | Description |
| --- | --- |
| npm run dev | Start frontend + backend in development |
| npm run build | Build client (Vite) + server (tsc) for production |
| npm start | Run the production server |
| npm run test:run | Run unit tests (Vitest) |
| npm run test:e2e | Run E2E tests (Playwright) |
| npm run test:coverage | Unit tests with coverage report |
| npm run lint | ESLint |

---

## Project structure

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

---

## Deployment

FlagstIQ is deployed on **Railway** with auto-provisioned PostgreSQL.

1. Connect the GitHub repo to a new Railway project
2. Set the following environment variables in Railway:

   | Variable | Description |
   | --- | --- |
   | DATABASE_URL | Auto-provided by Railway Postgres plugin |
   | APP_PASSWORD | App login password |
   | SESSION_SECRET | Secure random string for session signing |
   | ANTHROPIC_API_KEY | Required for AI features |
   | ADMIN_EMAIL | Receives new user registration notifications |
3. Build command: `npm run build`
4. Start command: `npm start`

The Express server serves both the REST API and the built SPA from the `dist/` folder.

---

## Documentation

See the [Wiki](https://github.com/madhu0rdont/flagstiq/wiki) for detailed documentation on:

- Architecture overview
- Data models
- Yardage book engine & recency weighting
- Physics imputation math
- Interleaved practice scoring
- DP/MDP strategy optimizer

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

Current version: **v1.7.2** — PDF Tactical Maps & DP Optimizer Performance

---

© 2026 FlagstIQ
