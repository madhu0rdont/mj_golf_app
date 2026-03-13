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

### V1. Backup import lacks referential integrity checks
**Severity:** MEDIUM
**File:** `routes/backup.ts:39-93`

Schema validates structure but not that shots reference valid sessions, or that numeric fields are in range.

**Fix:** Validate foreign key references and numeric bounds before insert.

### V2. Strategy constants update accepts arbitrary keys/values
**Severity:** MEDIUM
**File:** `routes/admin/strategy.ts:20-33`

No validation that `key` is a known constant or that `value` is in a reasonable range. Accepts `Infinity`, negative values, etc.

**Fix:** Whitelist known keys; validate value ranges.

### V3. Hazard penalty update accepts invalid values
**Severity:** MEDIUM
**File:** `routes/admin/hazards.ts:20-30`

No check that `penalty >= 0` or `type` is a known hazard type. Negative penalties break optimizer math.

**Fix:** Validate `0 <= penalty <= 10` and type against known hazard types.

### V4. Shots query default limit is 10,000
**Severity:** LOW
**File:** `routes/shots.ts:42`

Default `limit = 10000` could return excessive data for prolific users.

**Fix:** Cap at 5,000; consider pagination.

---

## LOGIC / CORRECTNESS

### L1. `impute.ts` division by zero on identical lofts
**Severity:** MEDIUM
**File:** `services/impute.ts:15, 22, 28`

`(p1.loft - p0.loft)` in denominator has no guard. Two tour reference points with identical lofts → `Infinity`/`NaN` propagates through club imputation.

**Fix:** Guard with `if (Math.abs(p1.loft - p0.loft) < 1e-10) return p0.value;`

### L2. `bearingStepForDistance` returns 2° for par 5s (same as par 3s)
**Severity:** LOW
**File:** `services/dp-optimizer.ts:548-551`

Par 5s (>350y) get the same fine 2° resolution as par 3s. This may be intentional but doubles computation vs a coarser step. Worth reviewing.

### L3. `normalizeAngle` returns [-180, 180] but callers use [0, 360]
**Severity:** LOW
**File:** `services/strategy-optimizer.ts:654-659`

`normalizeAngle` and `bearingBetween` use different angle ranges. No current bug but fragile for future bearing arithmetic.

---

## CLIENT-SIDE

### C1. Unguarded setTimeout in SettingsPage
**Severity:** MEDIUM
**File:** `src/pages/SettingsPage.tsx:115`

`setTimeout(() => setProfileStatus(''), 2000)` — no cleanup on unmount. React state update on unmounted component.

**Fix:** Store timer in ref, clear in useEffect cleanup.

### C2. `globalMutate` calls not awaited in useGamePlanCache
**Severity:** MEDIUM
**File:** `src/hooks/useGamePlanCache.ts:118, 141-145`

Cache invalidation not awaited → stale data may persist.

**Fix:** `await globalMutate(...)`.

### C3. Stale closure in SettingsContext setHandedness
**Severity:** MEDIUM
**File:** `src/context/SettingsContext.tsx:38`

Error revert uses `user?.handedness` from stale closure — not in dependency array.

**Fix:** Add `user` to deps or use functional state update.

### C4. No AbortController on long-running fetches
**Severity:** LOW
**File:** `src/hooks/useGamePlanCache.ts:81`, `src/pages/SessionPhotoPage.tsx:67`

Plan generation and photo extraction fetches not aborted on unmount → wasted resources.

### C5. Chart components not memoized
**Severity:** LOW
**Files:** `src/components/flight/DispersionChart.tsx`, `TrajectoryChart.tsx`, `MultiClub*`

Expensive SVG renders re-execute even when props unchanged.

**Fix:** Wrap exports with `React.memo()`.

### C6. ErrorBoundary silent in production
**Severity:** LOW
**File:** `src/components/ui/ErrorBoundary.tsx:20-22`

`componentDidCatch` only logs in DEV. Production errors invisible.
