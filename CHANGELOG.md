# Changelog

## v1.3.0 — Logging, Performance & Code Splitting
- Structured logger (`server/logger.ts`) — JSON in production, human-readable in dev; replaces all `console.log`/`console.error` across 15 server files
- PostgreSQL advisory lock for plan regeneration (multi-instance safe, replaces in-memory boolean flag)
- Fire-and-forget errors now logged instead of silently swallowed (4 `.catch(() => {})` sites fixed)
- Database indexes: `clubs(sort_order)`, `game_plan_cache(course_id, tee_box, mode)`, partial index on `game_plan_cache(stale)`
- Code splitting: 5 heavy pages lazy-loaded via `React.lazy()` + `Suspense` (recharts, katex, google maps, jsPDF)
- Vite `manualChunks` splits vendor libs into separate chunks (~1.3MB deferred from initial load)

## v1.2.0 — Security Hardening & Robustness
- Bcrypt password hashing with timing-safe comparison
- CSRF protection via custom header check on all mutating requests
- Rate limiting: login (5/15min), photo extraction (30/hr), hazard detection (50/hr)
- Session secret required in production (fatal exit if missing)
- Zod input validation on all critical API routes (clubs, sessions, backup, extract)
- React Error Boundary for graceful crash recovery
- Health check endpoints (`/health`, `/ready`) for Railway monitoring

## v1.1.0 — Navigation & Home Redesign
- Redesigned home page with dedicated Play and Practice sections
- New `/play` and `/practice` pages with tool links
- Simplified hamburger menu: 6 items in two groups (primary + utility) with divider
- Server-side auto-regeneration of game plans with history tracking
- Removed About page and dead BottomNav code

## v1.0.0 — Course Management Polish
- Dispersion-aware aim points on course maps with bias compensation
- Descriptive caddy tips identifying hazards by side, type, and distance
- Handicap data, multi-tee scorecards, and rich prose hole descriptions
- Course grid selection with logos (Claremont, Presidio)
- Course Management section in How It Works guide
- Server route hardening: error handling, transactions, validation, and tests
- Cleaned up unused code, dead routes, and stale theme colors

## v0.9.0 — Course Strategy
- Course Strategy module with KML import and PostgreSQL tables
- Hazard Mapper: satellite imagery with Claude Vision hazard detection
- Strategy Planner: satellite hole viewer with hazard overlays
- Monte Carlo simulation visualization on strategy maps
- Strategy Optimizer: named strategies, GPS simulation, score distributions
- Game Plan Generator with per-shot caddy tips
- Admin page redesign with 3-tab layout (Course Editor, Hazard Mapper, Strategy)
- Auto-import shared hazards from adjacent holes
- Editable hazard names and per-type penalty configuration

## v0.8.0 — Monte Carlo & How It Works
- Monte Carlo club recommendations with confidence intervals
- Proximity-based putting model replacing flat +2 putts
- Linear How It Works guide with SVG diagrams (replaced FAQ)
- Carry-over-time trend chart with book carry reference line
- Shot shape filter for yardage book with per-club preferred shape
- Client-side photo compression before Claude API upload
- Hamburger menu navigation drawer (replaced bottom nav)
- Imputed dispersion ellipses and offline column on yardage details

## v0.7.0 — Practice Modes
- Wedge distance practice: full/shoulder/hip swing positions in matrix grid
- Interleaved practice: simulated 9/18-hole rounds on the range
- Smart club recommendations with grip-down and wedge swing positions
- Scoring zone analysis (reaching within 100 yards)
- Iterative physics distance model with per-shot aim at hole

## v0.6.0 — Yardage Book Tabs & Physics Engine
- 3-tab yardage view: Yardages, Wedge Matrix, Details (each with own URL)
- Inline editing for yardage carry distances
- Physics-based imputation from carry + loft using PGA Tour Trackman reference data
- Manual carry values anchor imputed distances
- Collapsible flight charts on Details tab

## v0.5.0 — Server Migration
- Migrated from IndexedDB/Dexie to PostgreSQL + Express 5 API
- Server-side Claude API key handling for security
- Password login with server-side sessions (connect-pg-simple)
- SWR (stale-while-revalidate) data fetching
- JSON backup import/export over API

## v0.4.0 — Simulator Data & Yardage Book v2
- GC4 simulator data seeding from spreadsheet
- Sessions list page with edit and delete
- Redesigned Yardage Book with multi-club Trackman view and mishit toggle
- Distance imputation for clubs without shot data
- Database seeding from exported JSON backup on fresh boot

## v0.3.0 — Theme Redesign & Session Summary v2
- Left-handed support for shot shape classification
- Warm light FlavorFit design system (migrated from dark theme)
- Hero metrics grid with 7 stat cards and Trackman-style data table
- Edit session modal for club and date changes
- Mishit toggle filtering for metrics, charts, and table rows
- Side-by-side trajectory and dispersion charts with fairway green backgrounds
- Shape, Grade, Descent Angle, and Max Height columns in Trackman table

## v0.2.0 — Flight Charts & Testing
- Comprehensive test suite: 150 unit tests + 72 E2E tests
- Session flight visualizer with trajectory and dispersion charts

## v0.1.0 — Foundation
- PWA shell with offline support
- Club bag management: 14-club default bag, full CRUD, drag-to-reorder
- Manual session entry with real-time shot classification
- Session summary with stats, charts, and quality analysis
- AI photo extraction via Claude Vision API (GC4 screen capture)
- Yardage book with recency-weighted engine (30-day half-life) and gapping analysis
- CSV import with auto column mapping (Foresight FSX format)
- Course management with data-driven club recommendations
- Settings, dashboard, data export/import
