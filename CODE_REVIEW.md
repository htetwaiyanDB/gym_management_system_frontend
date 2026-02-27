# Code Review Report

## Scope
Reviewed the current frontend codebase with automated checks to identify correctness, maintainability, and React best-practice issues.

## Commands Run
- `npm run lint`
- `npm run build`

## Summary
- Build status: ✅ Pass
- Lint status: ❌ Failing (`20 errors`, `16 warnings`)

## High-Priority Issues (Lint Errors)

### 1) Unused imports/variables (`no-unused-vars`)
Multiple files contain unused imports, variables, and error placeholders. This adds noise and can hide real defects.

Examples reported by lint include:
- `src/auth/AuthContext.jsx` (`useEffect` unused)
- `src/hooks/useGlobalScanner.js` (`e` unused)
- `src/layouts/TrainerLayout.jsx` / `src/layouts/UserLayout.jsx` (`err` unused)
- `src/pages/admin/AdminAttendance.jsx` (`normalizeRole`, `glassSelectStyle`, and unused event params)
- `src/pages/admin/AdminSettings.jsx` (`axiosClient` unused)
- `src/pages/admin/AdminBoxingBookings.jsx` and `src/pages/admin/AdminTrainerBookings.jsx` (`monthCount` unused)
- `src/pages/trainer/TrainerScan.jsx` and `src/pages/user/UserScan.jsx` (`setIsScanningEnabled`/`nav` unused)

### 2) Empty `catch` or empty blocks (`no-empty`)
There are empty blocks that suppress errors without telemetry or fallback behavior.

Reported in:
- `src/layouts/AdminLayout.jsx`
- `src/pages/common/QrScanner.jsx`

Recommendation:
- At minimum, log with context (`console.warn` for dev) or route through a centralized UI toast/error handler.

### 3) React hook anti-pattern: setState directly in effect (`react-hooks/set-state-in-effect`)
Effects in `UserLayout` and `TrainerLayout` synchronously invoke state updates by calling `fetchUnreadCount()` directly in the effect body, which lint flags for potential cascading renders.

Reported in:
- `src/layouts/TrainerLayout.jsx`
- `src/layouts/UserLayout.jsx`

Recommendation:
- Make the immediate fetch invocation asynchronous via a scheduled callback or unify polling into a dedicated custom hook that subscribes/unsubscribes cleanly.

## Medium-Priority Issues (Warnings)

### 4) Missing hook dependencies (`react-hooks/exhaustive-deps`)
Several effects/memos omit dependencies, risking stale closures and inconsistent behavior.

Primary hotspots:
- `src/pages/admin/AdminAttendance.jsx`
- `src/pages/admin/AdminBoxingBookings.jsx`
- `src/pages/admin/AdminClassSubscriptions.jsx`
- `src/pages/admin/AdminTrainerBookings.jsx`
- `src/pages/admin/AdminUserHistory.jsx`

Recommendation:
- Add all missing dependencies or intentionally memoize callbacks with `useCallback` to stabilize dependency arrays.

### 5) Stale disable comments
A few files contain `eslint-disable` comments that no longer suppress active diagnostics and should be removed.

Reported in:
- `src/pages/admin/AdminBlogs.jsx`
- `src/pages/admin/AdminDashboard.jsx`
- `src/pages/admin/AdminSettings.jsx`
- `src/pages/trainer/TrainerSettings.jsx`
- `src/pages/user/UserSettings.jsx`

## Positive Notes
- Production build completes successfully and outputs optimized bundles.
- Project organization is clear by role-based page domains (`admin`, `trainer`, `user`, `public`) and shared components.

## Recommended Next Actions
1. Fix all lint **errors** first (blocking quality gate).
2. Address hook dependency **warnings** in high-traffic admin pages.
3. Remove stale `eslint-disable` directives.
4. Add CI gating for `npm run lint && npm run build` on pull requests.

## Suggested Quality Gate
Use this as a merge requirement:

```bash
npm run lint && npm run build
```

