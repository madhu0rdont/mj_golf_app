# Optimizer & Server Code Audit — 2026-03-12

37 findings across optimizer logic, server routes, and auth handlers.
All actionable items fixed (2026-03-13). Items #9, #14, #15 triaged as no-action-needed.

## HIGH (2)

### ~~1. Mutable global state + initial value mismatch~~ DONE
**Files:** `dp-optimizer.ts:99-163`, `strategy-optimizer.ts:311-326`

~~`applyConstants()` mutates module-level `let` variables (`ZONE_INTERVAL`, `LATERAL_OFFSET`, `LIE_MULTIPLIER`, etc.). Initial default `HAZARD_DROP_PENALTY = 0.15` doesn't match `DEFAULT_STRATEGY_CONSTANTS.hazard_drop_penalty = 0.3`. First run before `applyConstants` is ever called uses the wrong value.~~

**Fixed:** Aligned `HAZARD_DROP_PENALTY` default to `0.3`. Also fixed `strategy.ts` route to load constants from DB via `loadStrategyConstants()` and pass to `dpOptimizeHole` (was using hardcoded defaults). Added 2 tests for constants consistency.

### ~~2. `getProfileElevation` crashes on empty profile~~ DONE
**File:** `strategy-optimizer.ts:216-224`

~~When `profile.samples.length === 0` (happens when `totalDist === 0`), `samples[-1]` returns `undefined`, silently producing `NaN` through all elevation math.~~

**Fixed:** Added `if (profile.samples.length === 0) return 0;` guard.

## MEDIUM (6)

### ~~3. `gaussianSample` can produce Infinity~~ DONE
**File:** `strategy-optimizer.ts:114-119`

**Fixed:** Clamped `u1` to `Math.max(1e-10, Math.random())`.

### ~~4. `findNearestAnchor` + `find` double O(n) scan~~ DONE
**File:** `dp-optimizer.ts:1294, 1320, 1445`

~~`findNearestAnchor` returns an id, then callers do `anchors.find(a => a.id === id)`. Called ~16k times per simulation (8 shots x 2000 trials), each scanning ~100 anchors twice.~~

**Fixed:** Changed `findNearestAnchor` to return `AnchorState` directly. Updated all 4 callers to eliminate `.find()` double-scan.

### ~~5. `projectToHoleFrame` inconsistent perpDist for `along <= 0`~~ DONE
**File:** `dp-optimizer.ts:253-256`

**Fixed:** Changed `perpDist = dAP` to `perpDist = Math.abs(cross)` for consistency.

### ~~7. Inconsistent rough penalty between DP and legacy paths~~ DONE
**Files:** `dp-optimizer.ts:692` vs `strategy-optimizer.ts:1137`

~~DP path uses `HAZARD_DROP_PENALTY` (0.15), legacy `simulateHoleGPS` uses `roughPenalty` (0.3 from constants). 2x difference means fallback produces systematically higher expected strokes for rough-heavy holes.~~

**Fixed:** Resolved by #1 fix — both paths now use 0.3.

### ~~8. Greedy loop missing lie multiplier for non-tree lies~~ DONE
**File:** `dp-optimizer.ts:1458-1461`

~~Policy loop applies `LIE_MULTIPLIER[currentAnchor.lie]` for rough/bunker. Greedy loop only checks `lastHitTree` and defaults to `1.0` — shots from rough/bunker get no lie penalty.~~

**Fixed:** Added `classifyLie(currentPos, ...)` call in greedy loop to apply correct lie multiplier for rough/bunker positions.

### ~~10. Diversity enforcement over-constrains `excludeClubs`~~ DONE
**File:** `dp-optimizer.ts:1632-1657`

~~`usedFirstClubs` accumulates first-club names from *all* prior plans, not just the one causing the duplicate. Example: Plan 0 uses Driver, Plan 1 uses 3W (unique sequence), Plan 2 duplicates Plan 0 — both Driver AND 3W are excluded, but 3W is irrelevant.~~

**Fixed:** Replaced blind `usedFirstClubs` Set with `keyToFirstClub` Map keyed by club sequence. When a duplicate is found, excludes first clubs from all already-unique plans (not all prior plans indiscriminately). This prevents both the original duplicate and creating new duplicates with other existing plans.

### ~~11. Elevation lookup uses anchor `distFromTee` instead of actual position~~ DONE
**File:** `dp-optimizer.ts:1405-1409`

~~Policy loop uses `currentAnchor.distFromTee` for elevation, but `currentPos` may be up to 10y from the anchor. Greedy loop handles this correctly via `projectToHoleFrame`. On steep courses, this shifts carry by several yards.~~

**Fixed:** Policy loop now uses `projectToHoleFrame(currentPos, ...)` for elevation, consistent with the greedy loop.

## LOW (5)

### ~~6. Dead variable `oldV`~~ DONE
**File:** `dp-optimizer.ts:1116`

**Fixed:** Removed unused `const oldV` line.

### 9. ClubDistribution mutation (false alarm)
**Status:** No action needed.

### ~~12. Duplicate `polygonCentroid` definitions~~ DONE
**Files:** `dp-optimizer.ts:545`, `strategy-optimizer.ts:591`

**Fixed:** Removed dp-optimizer copy, now imports from strategy-optimizer.

### ~~13. `pFairway` excludes green landings~~ DONE
**File:** `dp-optimizer.ts:702-710`

**Fixed:** Green landings now increment `fairwayCount`.

### 14. Fractional tree penalty rounds to full stroke in score distribution
**File:** `dp-optimizer.ts:1426, 1484`

Tree hits add `+0.5` strokes, but `computeScoreDistribution` uses `Math.round(s) - par`. Design choice, not a bug.

### 15. Fragile bearing index offset scheme
**File:** `dp-optimizer.ts:840`

**Status:** No action needed with current constants.

---

# Part 2 — Spaghetti Code, Dead Code, Error Handling, Security

22 additional findings from review of server routes, auth, and optimizer structure.

## SECURITY

### ~~S1. Debug endpoints exposed in production without authentication~~ DONE
**Severity:** HIGH
**File:** `index.ts:55-292`

~~9 `/debug/*` routes are registered before `requireAuth` middleware and outside the `/api` prefix — they bypass auth entirely. `/debug/fix-elevations/:courseId` is especially dangerous: it **writes to the database** (updates `course_holes`, marks plans stale) with zero auth and zero rate limiting.~~

**Fixed:** Extracted all 9 debug endpoints to `routes/debug.ts` behind `requireAdmin`, mounted at `/api/debug` (after `requireAuth` middleware).

### ~~S2. `parseInt` on route params without NaN guard~~ DONE
**Severity:** MEDIUM
**File:** `index.ts:89, 146, 172, 246, 300`

~~Debug endpoints use `parseInt(req.params.holeNumber)` without checking for `NaN`. Value is passed to SQL queries — parameterized queries prevent injection, but `NaN` → `NULL` silently returns empty results.~~

**Fixed:** Added `isNaN` guards with 400 response to all 4 endpoints using `parseInt(req.params.holeNumber)` in `routes/debug.ts`.

### ~~S3. Railway project ID hardcoded in source~~ DONE
**Severity:** LOW
**File:** `admin.ts:804`

**Fixed:** Now reads from `process.env.RAILWAY_PROJECT_ID` with fallback.

### ~~S4. `courses` route uses `SELECT *`~~ DONE
**Severity:** LOW
**File:** `courses.ts:8-16`

**Fixed:** Replaced with explicit column list.

## DEAD CODE

### ~~D1. `getRoughPenalty` imported but unused in `game-plans.ts`~~ DONE
**Fixed:** Removed from import.

### ~~D2. `getRoughPenalty` imported but unused in `plan-regenerator.ts`~~ DONE
**Fixed:** Removed from import.

### ~~D3. Legacy optimizer functions are effectively dead code~~ DONE
**Severity:** LOW
**File:** `strategy-optimizer.ts:862-1283`

~~`generateNamedStrategies`, `simulateHoleGPS`, `optimizeHole` (~420 lines) only run when `dpOptimizeHole` returns empty, which effectively never happens in practice.~~

**Fixed:** Removed all 3 legacy functions + 6 orphaned helpers (`closestClub`, `longestClub`, `shortestClub`, `centerLinePoint`, `findSafeLanding`, `expectedLanding`, `getRoughPenalty`). Removed fallback calls from `game-plan.ts` and `generate-holes-worker.ts`. Cleaned up `roughPenalty` parameter from `generateGamePlan`, worker pool, and all callers. Removed legacy tests. `strategy-optimizer.ts` reduced from 1285 to 761 lines (−524).

### ~~D4. `_roughPenalty` parameter ignored in `dpOptimizeHole`~~ DONE
**Fixed:** Removed parameter and updated 4 call sites.

### ~~D5. Unused `ALLOWED_MEDIA_TYPES` constant~~ DONE
**Fixed:** Removed from extract.ts.

### ~~D6. Unused `_par` and `_distributions` parameters~~ DONE
**Fixed:** Removed from `valueIteration` and `findAlternativeTeeAction` signatures + call sites.

## ERROR HANDLING

### ~~E1. `admin/hazard-penalties` GET has no try/catch~~ DONE
**Fixed:** Wrapped in try/catch.

### ~~E2. `polygonCentroid` divides by zero on empty polygon~~ DONE
**Fixed:** Added empty-array guard.

### ~~E3. `auth/login` has no try/catch~~ DONE
**Severity:** MEDIUM
**File:** `auth.ts:45-95`

~~DB query and bcrypt compare are unguarded. DB failure → unhandled rejection → raw Express 500.~~

**Fixed:** Wrapped in try/catch with `logger.error` and proper 500 response.

### ~~E4. `auth/check` has no try/catch~~ DONE
**Fixed:** Wrapped in try/catch.

### ~~E5. `auth/forgot-password` has no try/catch~~ DONE
**Fixed:** Wrapped in try/catch.

### ~~E6. `auth/reset-password` has no try/catch~~ DONE
**Fixed:** Wrapped in try/catch + added hex token format validation.

### ~~E7. Plan regenerator `.toFixed()` can crash on NaN~~ DONE
**Fixed:** Guarded with `(plan.totalExpected ?? 0).toFixed(1)`.

## SPAGHETTI CODE

### ~~SP1. `simulateWithPolicy` — 210 lines with duplicated simulation loops~~ DONE
**Severity:** HIGH
**File:** `dp-optimizer.ts:1350-1559`

~~Two nearly identical simulation loops (~60 lines each): policy-following loop and greedy approach loop. Same pattern duplicated a 3rd time in `simulateHoleGPS` (strategy-optimizer.ts:1096-1197).~~

**Fixed:** Extracted `simulateSingleShot()` helper with shared shot physics (elevation, landing, tree collision, rollout, hazard drop). Both policy and greedy loops now call it. Third copy removed with D3 (legacy `simulateHoleGPS` deleted).

### ~~SP2. `index.ts` — 566 lines mixing debug routes with server setup~~ DONE
**Severity:** HIGH
**File:** `index.ts:55-353`

~~9 inline debug handlers (~300 lines) with their own DB queries, dynamic imports, and data transformation mixed with startup logic and server lifecycle.~~

**Fixed:** Extracted all 9 debug endpoints to `routes/debug.ts`. `index.ts` reduced from 567 to 268 lines.

### ~~SP3. `extractPlan` — 148 lines with interleaved concerns~~ DONE
**Severity:** MEDIUM
**File:** `dp-optimizer.ts:1197-1344`

~~Simultaneously handles plan construction, OB avoidance, approach insertion, elevation adjustment, and fallback logic in deeply nested control flow.~~

**Fixed:** Extracted `findSafeBearing()` (OB-avoidance retry loop) and `buildApproachShot()` (duplicated approach-shot logic from in-loop and post-loop blocks). `extractPlan` reduced from 148 to ~95 lines.

### ~~SP4. `dpOptimizeHole` reassigns `let` variables mid-flow~~ DONE
**Severity:** MEDIUM
**File:** `dp-optimizer.ts:1572-1698`

~~`policies`, `allValues`, and `outcomeTable` are reassigned when tee bearing expansion triggers. Couples diversity enforcement with extraction logic.~~

**Fixed:** Renamed initial computation to `const initialOutcome`/`initialPolicies`/`initialValues`. Expansion block now builds `expandedPolicies`/`expandedValues` and assigns to final `let` variables. Clear separation between initial and expanded results.

### ~~SP5. Manual snake_case → camelCase conversion duplicated~~ DONE
**Severity:** LOW
**File:** `index.ts:257-265, 314-320`

~~Debug endpoints manually convert DB rows instead of using existing `toCamel` utility.~~

**Fixed:** Replaced manual conversion with `toCamel(row)` in `routes/debug.ts` anchors + tee-actions endpoints.

### ~~SP6. `admin.ts` — 868-line monolith~~ DONE
**Severity:** LOW
**File:** `admin.ts:1-868`

~~Handles 10+ unrelated domains (KML import, elevation, scorecards, hazards, strategy constants, geofence, logos, usage dashboards, billing).~~

**Fixed:** Split into `routes/admin/` directory with 6 domain files + barrel: `kml.ts`, `courses.ts`, `holes.ts`, `hazards.ts`, `strategy.ts`, `billing.ts`. `requireAdmin` applied once in barrel `index.ts`. All 14 admin tests pass unchanged.
