# Unity Fitness Frontend

Unity Fitness Frontend is a React + Vite web application for managing gym operations across Admin, Trainer, and User roles. It supports attendance scanning (QR/RFID), membership workflows, subscriptions and bookings, notifications, messaging, and gym dashboard reporting.

## Product Overview

### Core role-based areas
- **Admin**: dashboard metrics, user management, attendance monitoring, pricing, subscriptions, booking management, messages, blogs, and system settings.
- **Trainer**: mobile-focused experience for attendance, class/member workflows, notifications, and communication.
- **User**: mobile-focused member experience for attendance scans, subscriptions/bookings, notifications, profile, and messaging.

### Architecture highlights
- Built with **React 19**, **Vite 7**, and **React Router**.
- API communication via a shared axios client.
- Reusable scanning support for **QR** and **RFID** attendance flows.
- UI uses Bootstrap + custom CSS.

---

## Tech Stack
- React, React DOM
- Vite
- React Router DOM
- Axios
- Bootstrap + Bootstrap Icons
- Recharts
- html5-qrcode

---

## Getting Started

### Prerequisites
- Node.js 20+
- npm 10+

### Installation
```bash
npm install
```

### Run locally
```bash
npm run dev
```

The app runs on Vite default host/port unless overridden.

---

## Environment Variables

Create a local `.env` file from `.env.example`:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | Yes | Base API path used by frontend requests (e.g. `https://api.example.com/api`). |
| `VITE_BACKEND_URL` | Yes | Backend origin used for non-API absolute integrations when needed. |

> `.env` is intentionally gitignored. Commit only `.env.example`.

---

## Available Scripts

- `npm run dev` — start development server.
- `npm run build` — create production build.
- `npm run preview` — preview production build locally.
- `npm run lint` — run ESLint.
- `npm run release:check` — run pre-release verification (`lint` + `build`).
- `npm run version:show` — print current package version.

---

## Lint & Quality Expectations

Current lint baseline targets:
- **0 ESLint errors** before release.
- Hook dependency warnings are tracked and should be reviewed whenever touching related modules.

Use:
```bash
npm run lint
```

---

## Deployment

### Build artifacts
```bash
npm run build
```
Output is generated in `dist/`.

### Recommended static deployment targets
- Netlify
- Vercel
- Nginx/Apache static hosting

For SPA routing, ensure fallback rewrites to `index.html` (a Netlify `_redirects` file is included in `public/`).

---

## Release Metadata & Versioning Strategy

This project follows **Semantic Versioning (SemVer)**:
- `MAJOR.MINOR.PATCH`
- **PATCH** for bug fixes and non-breaking cleanup.
- **MINOR** for backward-compatible feature additions.
- **MAJOR** for breaking API/UX changes.

Release checklist recommendation:
1. `npm run lint`
2. `npm run build`
3. Bump `package.json` version per SemVer.
4. Tag release in source control (`vX.Y.Z`).
5. Publish deployment artifact from `dist/`.

---

## Password Policy Note (Intentional PIN Model)

The profile update UI currently validates password changes as a **4-digit numeric PIN**.

This is intentional in the current product design and should only be used when backend controls are enforced, including:
- server-side rate limiting and lockout,
- secure transport (HTTPS),
- token/session validation,
- centralized audit logging.

If those controls are not guaranteed in your environment, migrate to a stronger password policy before production hardening.

---

## Known Limits

- Several hook dependency warnings remain and are tracked for staged refactors.
- Trainer/User experiences are optimized for mobile viewport usage.
- Scanner behavior relies on browser/device permission and camera capability.
- PIN-based password model is intentionally constrained and depends on stronger backend protections.

---

## License

MIT — see [LICENSE](./LICENSE).
