# Changelog

## v1.7.1 — Closed Beta Hardening
- **Seed route guard**: disabled in production (`NODE_ENV` / `RAILWAY_ENVIRONMENT` check)
- **Rate-limit reset-password**: 5 attempts per 15 minutes to prevent brute-force token guessing
- **Graceful shutdown**: SIGTERM/SIGINT handlers close HTTP server and database pool cleanly (10s timeout)
- **Admin registration notifications**: new users trigger an email to `ADMIN_EMAIL` with approve link
- **Setup handedness picker**: first-time setup form now lets the player choose left/right instead of hardcoding
- **Admin delete loading state**: delete confirmation shows "Deleting..." spinner and disables buttons during request
- **Empty sessions CTA**: "Start a Practice Session" button when no sessions exist
- Removed `window.location.reload()` after data import in Settings

## v1.7.0 — FlagstIQ Rebrand & Admin Enhancements
- **Rebrand**: renamed from "MJ Golf" to "FlagstIQ" across codebase, GitHub repo, Railway, wiki, and README
- **Course logo upload**: admin UI allows uploading custom course logos (base64, 128x128 center-crop); logos appear on Admin, Course Management, and Settings pages
- **Handicap course info**: info button next to "X courses tracked" on homepage shows which courses feed the handicap calculation
- **Game plan loader**: rich phase-aware progress during plan generation with 18 descriptive messages, progress bar, and rotating golf tips
- **Stale plan banner**: now shows per-hole phase messages and progress bar during auto-regeneration instead of generic "auto-refreshing..."
- **Copyright footer**: "© 2026 FlagstIQ" on login and settings pages
- **Login branding**: logo updated from "MJ Golf" to "FlagstIQ" on login and setup views
- Removed "Yardage Book · Season" tagline from homepage

## v1.6.2 — Strategy Consistency & Handicap Auto-Refresh
- Hole viewer now reads strategies from game plan cache first, ensuring the per-hole strategy recommendations always match the game plan
- Falls back to fresh DP computation only when no cached plan exists
- All 3 mode strategies (scoring, safe, aggressive) stored per hole in game plan cache via `allStrategies` field on `HolePlan`
- Handicap and course count auto-refresh immediately after manual plan generation
- Handicap auto-refreshes when stale plans finish auto-regenerating (stale → fresh transition)
- Fix double bias compensation in DP optimizer aim points — transition sampling already models `meanOffline`, so `compensateForBias()` was shifting aim ~8y too far; now only applied on greedy fallback paths

## v1.6.1 — Home Course & Optimizer Fixes
- Home course user preference: selectable from Settings page, stored in DB (`home_course_id` column on users table), displayed on homepage with gold dot label
- Settings page home course dropdown with course logo thumbnails, integrated into existing profile save flow
- Auth responses (`/login`, `/check`, `/setup`) include `homeCourseId` in user payload
- DP optimizer: tighten `MAX_CARRY_RATIO` from 1.20 to 1.10 — prevents overshooting (e.g., 4H at 215y no longer eligible from 193y remaining)
- DP optimizer: add `CHIP_RANGE = 30` — within 30 yards of the pin, treat as chip/putt zone instead of adding a phantom full-wedge approach shot
- DP optimizer: cap approach shot carry label at actual remaining distance (not club's full carry) for accurate visualization
- DP optimizer: run `resolveHazardDrop()` in `extractPlan()` — projected landings that cross OB/water now resolve to the drop point, so the visualization shows the correct drop location and the next shot starts from there

## v1.6.0 — Auth Flows & Login Redesign
- Forgot password flow with email magic link (Resend API, SHA-256 hashed tokens, 1-hour expiry)
- Open registration with admin approval: new users land in "pending" status until an admin approves
- Login accepts both email and username
- Redesigned login page with multi-view state machine: sign in, create account, forgot password, confirmation screens
- Password reset page at `/reset-password?token=...` (accessible without auth)
- Admin UserManager shows pending users with Approve/Reject buttons and status badges
- Database: `status` column on users table, `password_reset_tokens` table
- New server endpoints: `POST /forgot-password`, `POST /reset-password`, `POST /register`, `PUT /users/:id/status`
- Shared validation utils extracted (`isValidEmail`, `isValidPassword`)
- 20 auth tests covering login, status checks, registration, forgot/reset password flows

## v1.5.9 — Test Coverage & Course Logos
- Add test coverage for users, shots, and wedge-overrides routes (66 new tests)
- Tests cover admin CRUD, race condition handling (23505), Zod validation, email regex, role guards
- Remove diagnostic test files (hole7-diagnostic, hole7-real-diagnostic) — debug artifacts with no assertions
- Add course logos: Tilden Park, TCC Brookline, Harding Park, Meadow Club, Blackhawk
- Logos auto-matched by course name in Admin and Strategy Planner pages

## v1.5.8 — Security Hardening
- Sanitize external API error responses — no Anthropic internals or stack traces leaked to clients
- Global write rate limiter: 200 requests per 15 minutes on all mutating endpoints (POST/PUT/PATCH/DELETE)
- Fix user creation race condition: rely on DB UNIQUE constraints instead of pre-check SELECTs (eliminates TOCTOU window)
- Zod validation on shots query params (`since`, `clubId`, `limit`) and wedge-override PUT body
- Multer file filter restricts KML uploads to `.kml` extension or KML/XML MIME types (5MB limit, down from 10MB)
- Suppress `console.error` in production ErrorBoundary
- Reduce session cookie maxAge from 30 days to 7 days
- Stricter email validation with RFC 5322-based regex (requires 2+ char TLD, valid domain labels)

## v1.5.7 — Dogleg Tee Bearing Fix
- Fix DP optimizer bearing selection on dogleg holes: tee bearing now looks 200 yards ahead on the center line (driver landing zone) instead of only 20 yards, so the ±30° bearing fan is centered on where drives actually land
- On doglegs, the first 20y of the hole is straight — the curve happens at 150-250y. The old 20y look-ahead centered the bearing fan on the pre-curve direction, causing the optimizer to miss fairway-following bearings entirely on sharp doglegs
- Straight holes are unaffected (center line at 20y and 200y point the same direction)

## v1.5.6 — Homepage Improvements & Worker Threads
- Dynamic user name: homepage title now shows the logged-in user's first name instead of hardcoded "Madhu's"
- Bag button promoted to same size/styling as Play and Practice in a 3-column grid
- Estimated handicap badge: new `/api/game-plans/handicap` endpoint computes average differential from cached scoring plans using course rating/slope, displayed on the homepage
- Worker threads: game plan generation (DP optimizer) now runs in `worker_threads` so the site stays responsive during background plan regeneration
- Decoupled optimizer version from package version — UI-only version bumps no longer trigger costly plan regeneration
- Static asset caching: hashed assets cached 1 year (immutable), index.html no-cache for instant deploys
- N+1 query fix in scorecard update (18 queries → 1) and batched hazard penalty upserts
- Composite index on `shots(user_id, session_id)` for faster yardage book queries
- SWR exponential backoff for stale plan polling (3s→6s→12s→30s cap)
- Parallel plan regeneration: 2 concurrent worker threads with pre-loaded course data
- Scoped SWR session revalidation: only refetch list keys, not shot detail sub-keys
- Conditional JOIN in `/api/shots`: skip sessions join when `?since` filter not used
- Covering index on `game_plan_history` for faster history list queries
- Lazy-load profile picture avatars: list endpoint excludes blobs, separate `/api/users/:id/picture` endpoint

## v1.5.5 — Fairway-Aware Bearing Selection
- Finer bearing resolution: `BEARING_STEP` reduced from 5° to 2° (31 bearings per zone instead of 13), enabling the optimizer to resolve narrow fairway windows
- Lie cascade correction: rough landings now penalized for cascading effects (wider dispersion from `ROUGH_LIE_MULTIPLIER` leading to more rough on subsequent shots), preventing the optimizer from favoring rough-landing bearings with better approach distances
- Tracks `pFairway` per action in transition sampling to inform lie cascade correction
- Fixes TCC Primrose Hole 7: aim point fairway rate jumps from 14% to 57%, optimizer now correctly targets fairway-hitting bearings

## v1.5.4 — Fairway-Aware Strategy Optimizer
- Implicit rough penalty: shots landing outside fairway/green/hazard polygons now incur the rough penalty from settings (default 0.3 strokes)
- Rough penalty loaded from `hazard_penalties` DB table — configurable via Admin > Hazard Penalties
- Optimizer now strongly favors landing on defined fairway polygons, producing realistic golf strategies
- Threaded rough penalty through all code paths: DP optimizer, MC simulation, game plan generation, and plan regeneration

## v1.5.3 — Rules of Golf Hazard Drop Logic
- OB drops now land at the boundary entry point (binary search along trajectory, 2y offset) instead of 5y backward from inside OB — prevents cascading penalties from balls dropped in unplayable positions
- Bunker balls stay in place (penalty represents shot difficulty, not a re-drop)
- Water drops validated via `findSafeDrop()` to avoid landing in adjacent hazards
- Admin map orientation now matches course management page (fitBounds + heading correction)

## v1.5.2 — DP Optimizer: V Fallback, MC Resilience, Dogleg Aim Bearings
- Fix inflated V values for no-action zones: approach-aware fallback using `greedyClub` instead of broken `expectedPutts(rawDist)` (~0.7–1.0 stroke deflation, making Driver/3Wood competitive on long holes)
- MC simulation no longer breaks on missing policy entries: fires inline greedy shots and continues, so each scoring mode produces independent expected-stroke estimates
- Aim bearing fan centered on `zone.localBearing` (centerLine direction) instead of pin bearing, naturally aiming tee shots down the fairway on doglegs

## v1.5.1 — DP Optimizer Dogleg Fix & Test Coverage
- Synthetic center line for doglegs: when `centerLine` is empty, `synthesizeCenterLine()` walks the fairway in 20y steps using a scored bearing fan (±75°) to avoid hazards
- Approach threshold: plans now add a final approach shot when landing within the shortest club's carry distance (58-degree wedge), ensuring plans always reach the green
- Greedy fallback in `extractPlan()`: missing policy entries or invalid club indices fall through to `greedyClub()` instead of breaking the plan early
- Strategy diversity fix: different scoring modes now produce different first-shot clubs via `findAlternativeTeeAction()`
- 31 new unit tests for `dp-optimizer.ts` covering zone discretization, dogleg integration, approach threshold, diversity enforcement, and edge cases (482 total tests)

## v1.5.0 — DP/MDP Strategy Optimizer
- Replace hardcoded strategy templates with Dynamic Programming / Markov Decision Process optimizer
- Zone discretization along hole centerline with 3 lateral positions per interval
- Transition sampling (200 Gaussian shots per action) shared across all 3 scoring modes
- Value iteration with mode-specific objectives: Scoring (expected strokes), Safe (risk-adjusted), Aggressive (birdie hunt)
- Policy extraction with Monte Carlo simulation (2,000 trials) for accurate score distributions
- How It Works page updated with DP/MDP documentation

## v1.4.1 — Split Fairways & Strategy Map Visuals
- Split fairway support: `fairway` field is now `Coord[][]` (array of polygons) with auto-migration of legacy data
- Admin editor: additive fairway drawing, per-polygon selection/edit/delete
- Strategy map: per-shot dual lines — white dashed aim line + cyan curved ball flight showing draw/fade shape
- Shot 2 arrow now correctly originates from shot 1's landing zone center (not aim position)
- Bezier curve ball flight uses aim point as control point for accurate draw/fade visualization
- Fix 404 on `/strategy/:courseId` direct navigation (missing route)

## v1.4.0 — Admin Deep Links, 9-Hole Support & Hardening
- Admin page state (tab, course, hole) persisted in URL — refresh-safe, deep-linkable, browser back/forward works
- 9-hole course support: KML parser auto-detects hole count, PDF/game plan/UI all handle variable hole counts
- Security headers via Helmet (HSTS, X-Content-Type-Options, X-Frame-Options)
- Response compression via `compression` middleware
- SQL injection fix: parameterized LIMIT clause in shots query
- Database pool error handler + rollback safety in transactions
- DATABASE_URL startup validation in production + 30s query timeout
- Server types tightened: ShotShape/ShotQuality/SwingPosition enums, removed `any` types from GappingChart
- DELETE sessions returns 204 No Content
- Removed dead code: web-mercator module, unused units/setUnits from SettingsContext
- New test suites: auth routes (5 tests), admin routes (8 tests)
- Admin UX: inline scorecard editor, scorecard/notes above map, auto-detect buttons removed, hazard-detect endpoint removed (~300 lines)
- Game plan PDF redesign: dark header bar, score distribution bar, color-coded hole cards
- Center Green strategy fix: uses green polygon centroid instead of fairway
- Backup import loading spinner + error color coding

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
