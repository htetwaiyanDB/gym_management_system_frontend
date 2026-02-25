# Unity Fitness Gym Management System — Frontend

A React + Vite frontend for managing day-to-day operations of a gym, including member onboarding, trainer workflows, subscriptions, bookings, attendance scanning, messaging, and admin reporting.

## Product overview

This application provides role-based experiences for:

- **Public users**: registration, login, email verification, and public blog views.
- **Members (users)**: attendance view/scan, subscriptions, bookings, notifications, and profile settings.
- **Trainers**: attendance scan/check-in features, bookings, notifications, and profile settings.
- **Admins**: operational dashboards, pricing, attendance monitoring and scanner control, user management, subscriptions, class subscriptions, trainer/boxing bookings, blogs, messaging, and settings.

The frontend communicates with a backend API (Laravel-style JSON endpoints) and persists auth/session context in browser storage.

## Tech stack

- React 19
- Vite 7
- React Router 7
- Axios
- Bootstrap + Bootstrap Icons
- Recharts
- html5-qrcode

## Prerequisites

- **Node.js 20+** (recommended)
- **npm 10+**
- Running backend API accessible from this frontend

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment template:

   ```bash
   cp .env.example .env
   ```

3. Fill in `.env` values (see **Environment variables**).

4. Start local dev server:

   ```bash
   npm run dev
   ```

5. Open the URL shown by Vite (typically `http://localhost:5173`).

## Environment variables

Defined in `.env.example`:

- `VITE_API_URL` — primary API base URL used by Axios clients.
- `VITE_BACKEND_URL` — backend origin used for related backend URL generation.

Example:

```env
VITE_API_URL=http://localhost:8000/api
VITE_BACKEND_URL=http://localhost:8000
```

## Available scripts

- `npm run dev` — start Vite development server.
- `npm run build` — create production bundle in `dist/`.
- `npm run preview` — preview production build locally.
- `npm run lint` — run ESLint checks.

## Deployment

1. Build production assets:

   ```bash
   npm run build
   ```

2. Deploy `dist/` to static hosting (Netlify, Vercel, Nginx, Apache, etc.).
3. Ensure SPA fallback routing is configured (`public/_redirects` is provided for compatible hosts).
4. Configure production environment variables in hosting platform.
5. Point frontend API variables to production backend endpoints.

## Release metadata and versioning strategy

- Package metadata is maintained in `package.json` (`name`, `version`, `license`, and `description`).
- Versioning strategy follows **Semantic Versioning**:
  - `MAJOR`: breaking UI/API compatibility changes.
  - `MINOR`: backward-compatible features.
  - `PATCH`: fixes/refactors/docs with no feature break.
- Recommended release flow:
  1. Create release branch.
  2. Ensure lint/build pass.
  3. Bump version in `package.json`.
  4. Tag release (`vX.Y.Z`).
  5. Publish release notes including user-visible changes and migration notes.

## Security note: password/PIN policy

This frontend currently uses a **4-digit numeric PIN** policy in account and profile forms for compatibility with existing backend behavior.

- Frontend enforces exactly 4 numeric digits in relevant forms.
- This is intentional for current product behavior.
- Production hardening should rely on backend controls (rate limiting, lockouts, hashing, monitoring, MFA/step-up authentication where applicable).

If your deployment requires full password complexity, update backend validation first, then align frontend form validation and UX copy.

## Known limitations

- Some workflows assume backend response shape variants and include defensive normalization; API contract drift may still affect edge cases.
- Scanner behavior depends on browser/device capabilities and camera/RFID hardware availability.
- Auth/session state is browser-storage based and assumes trusted client environment + backend token controls.
- No end-to-end test suite is currently bundled in this repo.

## License

This project is licensed under the MIT License. See `LICENSE`.
