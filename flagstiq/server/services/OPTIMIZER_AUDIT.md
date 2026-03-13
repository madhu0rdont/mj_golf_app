# Codebase Audit — 2026-03-13 (Pass 2)

Findings across server services, routes, and client code.

---

## SECURITY

### ~~S1. Wedge override ON CONFLICT missing `user_id`~~ DONE
**Severity:** HIGH
**File:** `routes/wedge-overrides.ts:37-41`

Added DB migration for `UNIQUE(user_id, club_id, position)` constraint; updated ON CONFLICT clause to use `EXCLUDED.carry`.

### ~~S2. JSON payload limit is 50MB~~ DONE
**Severity:** MEDIUM
**File:** `index.ts:47`

Reduced from `'50mb'` to `'5mb'`.

### ~~S3. Profile picture validation insufficient~~ DONE
**Severity:** MEDIUM
**File:** `routes/users.ts:157-162`

Now validates against `data:image/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$`.

### ~~S4. Backup import leaks internal error details~~ DONE
**Severity:** MEDIUM
**File:** `routes/backup.ts:88-91`

Now returns generic "Import failed"; details kept in server log only.

### ~~S5. CSRF protection is header-only~~ DONE
**Severity:** LOW
**File:** `middleware/csrf.ts:5-15`

Added documentation explaining why header-only CSRF is sufficient for SPA-only API and when to upgrade.

### ~~S6. Weak password validation~~ DONE
**Severity:** LOW
**File:** `utils/validation.ts:5`

Now requires uppercase, lowercase, and a number in addition to >= 8 chars.

---

## ERROR HANDLING

### ~~E1. `/setup` route has no try-catch~~ DONE
**Severity:** HIGH
**File:** `routes/auth.ts:307-366`

Wrapped in try-catch with duplicate key handling (23505) and generic 500 fallback.

### ~~E2. Worker fails entire batch on single hole error~~ DONE
**Severity:** HIGH
**File:** `services/generate-holes-worker.ts:11-28`

Per-hole try-catch; pushes empty strategies on failure, sends `warning` message, continues processing. Pool handler logs warnings.

### ~~E3. Elevation API result count not validated~~ DONE
**Severity:** MEDIUM
**File:** `services/elevation.ts:43`

Added `data.results.length !== batch.length` guard before iterating.

### ~~E4. Unchecked `rows[0]` after queries in auth routes~~ DONE
**Severity:** MEDIUM
**File:** `routes/auth.ts:118, 309`

Added `countRows.length === 0` guards at both locations.

### ~~E5. SSE stream reader has no error handling~~ DONE
**Severity:** MEDIUM
**File:** `src/hooks/useGamePlanCache.ts:89-112`

Inner try-catch around SSE reader loop; logs error and continues to cache revalidation.

### ~~E6. WedgePracticePage save error not shown to user~~ DONE
**Severity:** MEDIUM
**File:** `src/pages/WedgePracticePage.tsx:196`

Added `saveError` state with coral error banner displayed below save button.

---

## INPUT VALIDATION

### ~~V1. Backup import lacks referential integrity checks~~ DONE
**Severity:** MEDIUM
**File:** `routes/backup.ts:39-93`

Added pre-insert validation that shots reference sessions and clubs present in the import.

### ~~V2. Strategy constants update accepts arbitrary keys/values~~ DONE
**Severity:** MEDIUM
**File:** `routes/admin/strategy.ts:20-33`

Added `VALID_CONSTANT_KEYS` allowlist and range validation (finite, 0–100000).

### ~~V3. Hazard penalty update accepts invalid values~~ DONE
**Severity:** MEDIUM
**File:** `routes/admin/hazards.ts:20-30`

Added `VALID_HAZARD_TYPES` allowlist and range validation (0–10).

### ~~V4. Shots query default limit is 10,000~~ DONE
**Severity:** LOW
**File:** `routes/shots.ts:42`

Default reduced to 5,000; hard cap at 5,000 regardless of query param.

---

## LOGIC / CORRECTNESS

### ~~L1. `impute.ts` division by zero on identical lofts~~ DONE
**Severity:** MEDIUM
**File:** `services/impute.ts:15, 22, 28`

Added `Math.abs(denom) < 1e-10` guard at all three interpolation branches.

### L2. `bearingStepForDistance` returns 2° for par 5s (same as par 3s) — REVIEWED, NO ACTION
**Severity:** LOW
**File:** `services/dp-optimizer.ts:548-551`

Intentional: par 5 tee shots need fine bearing resolution for the DP optimizer to find safe windows. The computation cost is acceptable.

### L3. `normalizeAngle` returns [-180, 180] but callers use [0, 360] — REVIEWED, NO ACTION
**Severity:** LOW
**File:** `services/strategy-optimizer.ts:654-659`

Correct design: `normalizeAngle` is used for relative bearing differences (where [-180, 180] is appropriate), while `bearingBetween` returns absolute bearings [0, 360]. No inconsistency.

---

## CLIENT-SIDE

### ~~C1. Unguarded setTimeout in SettingsPage~~ DONE
**Severity:** MEDIUM
**File:** `src/pages/SettingsPage.tsx:115`

Timer stored in ref, cleared on unmount via useEffect cleanup.

### ~~C2. `globalMutate` calls not awaited in useGamePlanCache~~ DONE
**Severity:** MEDIUM
**File:** `src/hooks/useGamePlanCache.ts:118, 141-145`

All `globalMutate` calls now awaited.

### ~~C3. Stale closure in SettingsContext setHandedness~~ DONE
**Severity:** MEDIUM
**File:** `src/context/SettingsContext.tsx:38`

Capture `previousHandedness` before async call; added `user` to dependency array.

### C4. No AbortController on long-running fetches — NO ACTION
**Severity:** LOW
**File:** `src/hooks/useGamePlanCache.ts:81`, `src/pages/SessionPhotoPage.tsx:67`

User-initiated actions (not effects), and SSE stream is now protected by E5's try-catch. Acceptable risk.

### ~~C5. Chart components not memoized~~ DONE
**Severity:** LOW
**Files:** `src/components/flight/DispersionChart.tsx`, `TrajectoryChart.tsx`

Wrapped with `React.memo()`. No MultiClub components found in codebase.

### ~~C6. ErrorBoundary silent in production~~ DONE
**Severity:** LOW
**File:** `src/components/ui/ErrorBoundary.tsx:20-22`

Removed DEV-only gate; errors now logged in all environments.
