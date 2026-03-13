# Codebase Audit — 2026-03-13 (Pass 3)

Three agents audited server routes/services, client React code, and tests/config/performance. Below are the consolidated findings, deduplicated and verified by reading source files.

---

## SECURITY

### S1. XSS via HTML email injection
**Severity:** HIGH
**File:** `services/email.ts:50, 73-74, 88`

`displayName`, `username`, and `email` are interpolated directly into HTML templates without escaping. A user registering with `displayName: "<img src=x onerror=alert(1)>"` injects that into the admin notification and welcome emails.

**Fix:** Add an `escapeHtml()` helper and escape all user-supplied values before interpolation.

### S2. Admin holes PATCH has no try-catch
**Severity:** HIGH
**File:** `routes/admin/holes.ts:10-78`

The main PATCH handler is async with no top-level try-catch. If queries at lines 63-64 or 72-74 throw, no response is sent and the connection hangs. Every other route in the codebase wraps in try-catch.

**Fix:** Wrap in try-catch with `logger.error` + 500 response.

### S3. Password not validated in PUT /users/me
**Severity:** MEDIUM
**File:** `routes/users.ts:127-131`

When a user changes their password via self-service, `isValidPassword()` is not called. They could set it to `"a"`. Same issue in admin route `PUT /users/:id` (line 272).

**Fix:** Add `isValidPassword(password)` check before hashing in both routes.

### S4. `fetcher.ts` missing CSRF header
**Severity:** MEDIUM
**File:** `src/lib/fetcher.ts:2`

The SWR fetcher sends no `X-Requested-With` header. The `api.ts` module sends it on all requests. If CSRF middleware checks this header, GET requests via SWR bypass it.

**Fix:** Add `headers: { 'X-Requested-With': 'fetch' }` to the fetch call.

### S5. Session PUT route lacks input validation
**Severity:** MEDIUM
**File:** `routes/sessions.ts:162-206`

`clubId` and `date` from `req.body` are used without validation. `clubId` is not validated as UUID, `date` is not validated as number, and `clubId` is not verified to belong to the user (shots get reassigned to a foreign club at line 193).

**Fix:** Add Zod schema + verify `clubId` ownership before updating.

### S6. Debug routes leak all users' data
**Severity:** MEDIUM
**File:** `routes/debug.ts:14, 279-283`

Debug endpoints query `clubs`, `shots`, and `game_plan_cache` without `user_id` filter. The `/tee-actions` endpoint loads the entire shots table into memory with no limit.

**Fix:** Add `user_id` filter (or accept a query param for admin use) and a `LIMIT` on shots.

---

## DATA / PERFORMANCE

### D1. `useYardageBook` fetches ALL shots on every page
**Severity:** HIGH
**File:** `src/hooks/useYardageBook.ts:194-203`

Three separate SWR calls fetch ALL clubs, sessions, and shots on every page using this hook (HomePage, PracticePage, InterleavedPracticePage, YardageBookPage, WedgePracticePage, ClubDetailPage). `useClubHistory` (line 301) also fetches ALL shots just to filter for one club. This is the biggest data flow issue — the entire shot table is loaded into memory on most page transitions.

**Fix:** Add a server-side `/api/yardage-book` endpoint that computes the book server-side and returns the pre-aggregated entries. For `useClubHistory`, add `/api/clubs/:id/history`. This eliminates 3 round-trips and moves O(N) processing to the server.

### D2. AuthContext provider value recreated every render
**Severity:** HIGH
**File:** `src/context/AuthContext.tsx:177-192`

The `value` object is a new object literal on every render. Even though callbacks are `useCallback`-wrapped, the object reference changes, forcing ALL context consumers to re-render on every AuthProvider state change. With SWR + multiple hooks, this causes cascading unnecessary re-renders.

**Fix:** Wrap the value in `useMemo(...)`.

### D3. SettingsContext provider value not memoized
**Severity:** MEDIUM
**File:** `src/context/SettingsContext.tsx:46`

Same pattern — `{ handedness, setHandedness }` recreated every render.

**Fix:** Wrap in `useMemo(() => ({ handedness, setHandedness }), [handedness, setHandedness])`.

### D4. Plan generation loads ALL shots unbounded
**Severity:** MEDIUM
**Files:** `routes/game-plans.ts:197`, `routes/strategy.ts:36`, `services/plan-regenerator.ts:48`

Every plan generation or strategy computation does `SELECT * FROM shots WHERE user_id = $1` with no limit. Only the columns needed for distribution-building should be selected, and a date/count limit would reduce memory usage.

**Fix:** Select only needed columns (`carry_yards, total_yards, offline_yards, club_id`) and add `ORDER BY created_at DESC LIMIT 2000` or similar.

---

## CLIENT BUGS

### C1. Non-null assertion on `token` in ResetPasswordPage
**Severity:** MEDIUM
**File:** `src/pages/ResetPasswordPage.tsx:34`

`resetPassword(token!, password)` — `token` could be null. The UI guards at line 56, but the submit handler is defined before the guard renders.

**Fix:** Add `if (!token) return;` before the call.

### C2. Unhandled promise rejection in ClubBagPage seed button
**Severity:** MEDIUM
**File:** `src/pages/ClubBagPage.tsx:37`

If `api.post('/seed', {})` throws, `seeding` stays true (button stuck loading) and the error is uncaught.

**Fix:** Wrap in try/catch/finally.

### C3. Memory leak — Object URL never revoked in PhotoCapture
**Severity:** MEDIUM
**File:** `src/components/sessions/PhotoCapture.tsx:16-17`

`URL.createObjectURL` is called but `URL.revokeObjectURL` is never called in `clear()` or on unmount. Each new photo leaks a blob URL.

**Fix:** Revoke in `clear()` and add `useEffect` cleanup.

### C4. `handleFinishRound` has no catch block
**Severity:** MEDIUM
**File:** `src/pages/InterleavedPracticePage.tsx:270-303`

If `createSession` throws, the error is silently swallowed (try/finally, no catch). User sees no error message.

**Fix:** Add catch block with error state + UI feedback.

### C5. Duplicate `resizeImage`/`COURSE_LOGOS` across 3 files
**Severity:** LOW
**Files:** `src/pages/AdminPage.tsx`, `SettingsPage.tsx`, `StrategyPlannerPage.tsx`

Copy-pasted utilities with inconsistent logo paths (`tcc.png` vs `tcc.svg`, `meadow.webp` vs `meadow-club.webp`).

**Fix:** Extract to shared `src/utils/images.ts`.

### C6. `api.ts` headers overwritten by spread
**Severity:** LOW
**File:** `src/lib/api.ts:3-6`

`...options` spread replaces default headers entirely if caller passes `headers`. No callers do currently, but it's a footgun.

**Fix:** Merge headers: `headers: { ...defaults, ...options?.headers }`.

---

## Implementation Order

### Batch 1 — Security + Data (highest impact)
1. **S1** — `escapeHtml` in email.ts
2. **S2** — try-catch in admin/holes.ts PATCH
3. **S3** — password validation in users.ts PUT (both routes)
4. **S4** — CSRF header in fetcher.ts
5. **S5** — Zod validation + clubId ownership check in sessions.ts PUT
6. **S6** — user_id filter + LIMIT on debug routes
7. **D2** — `useMemo` on AuthContext provider value
8. **D3** — `useMemo` on SettingsContext provider value

### Batch 2 — Client bugs
9. **C1** — null guard in ResetPasswordPage
10. **C2** — try/catch in ClubBagPage seed
11. **C3** — revokeObjectURL in PhotoCapture
12. **C4** — catch block in InterleavedPracticePage
13. **C5** — extract shared image utils
14. **C6** — fix header merge in api.ts

### Batch 3 — Data optimization (larger scope)
15. **D1** — Server-side yardage book endpoint (moves computation server-side, eliminates 3 client fetches per page)
16. **D4** — Select only needed columns + limit in plan generation queries

## Verification
1. `npm run build` — strict TypeScript
2. `npx vitest run` — all tests pass
3. Commit per batch, push, deploy
