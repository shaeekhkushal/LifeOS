# LifeOS

LifeOS is a local-first personal tracking application. A signed-in user can record finances, habits, goals, tasks, and entries for other areas of life. The app is a Next.js application hosted by Node.js; user accounts and records are stored in a project-local SQLite database, not a hosted cloud service.

This README describes the implementation that currently exists in this repository. Some workspace sections share a configurable tracking-entry interface; they are not all separate, domain-specific applications.

## Contents

- [Current Features](#current-features)
- [Requirements](#requirements)
- [Install and Run](#install-and-run)
- [Project Structure](#project-structure)
- [Application Architecture](#application-architecture)
- [Data and Accounts](#data-and-accounts)
- [Contributing](#contributing)
- [Validation Commands](#validation-commands)
- [Troubleshooting](#troubleshooting)
- [Known Limitations](#known-limitations)

## Current Features

| Area | Current implementation |
| --- | --- |
| Overview | Monthly income, expenses, savings, and balance; transaction trends and categories; habit consistency heatmap; goal progress; task status; and recent records |
| Finance | Accounts, categories, income and expense transactions, and spending summaries |
| Habits | Daily or weekly habits, dated check-ins, streaks, and completion summaries |
| Productivity | Tasks with scheduled date, optional deadline, priority, and status |
| Goals | Goal targets, progress updates, dates, priority, and status |
| Health, Learning, Career, Travel, Shopping, Vehicle, Home, Entertainment, Calendar | Configured tracking-entry views backed by the shared `tracking_entries` collection |
| Reports | Summary charts and counts based on saved tracking entries, transactions, and habit logs |
| Settings | Profile and currency settings, password change, account data reset, and record counts |

The main workspace navigation is rendered by `src/app/page.tsx`. Navigation between these sections is client-side state represented by URL hashes; the sections do not have individual URL routes. Settings is linked from the sidebar footer and is included in the recognized navigation pages.

## Requirements

- Node.js 22.13 or later. The server uses Node's built-in `node:sqlite` module.
- npm, included with Node.js.
- Git, if you are checking out the repository.

No separate SQLite server or database package is required. Depending on the Node.js release, SQLite may emit an experimental-feature warning.

## Install and Run

Run these commands from the repository root. The application and its `package.json` are inside `lifeos-app`.

```bash
cd lifeos-app
npm ci
```

Start the development server on all network interfaces using the command used for shared-device testing:

```bash
cd lifeos-app && npm run dev -- --hostname 0.0.0.0
```

Open `http://localhost:3000` on the host machine. To let another device on the same trusted local network connect, use the host machine's LAN IP address and port 3000, for example `http://192.168.1.20:3000`. Do not use `0.0.0.0` as the browser address. Keep the host and server process running while other devices use the app. All devices must connect to the same server to share its database.

For local-only access, run `npm run dev` from `lifeos-app` instead. For a production build and local production server:

```bash
cd lifeos-app
npm run build
npm run start -- --hostname 0.0.0.0
```

The database path is resolved from the server's current working directory. Always start the app from `lifeos-app`; starting it from the repository root would change where the database is created.

## Project Structure

```text
LifeOs/
  README.md                       Project and contributor documentation
  master.md                       Original product/build brief
  lifeos-app/
    package.json                  Scripts and direct dependencies
    package-lock.json             Reproducible npm dependency lockfile
    next.config.ts                Next.js configuration
    tsconfig.json                 Strict TypeScript configuration and @/* alias
    eslint.config.mjs             ESLint configuration
    postcss.config.mjs             Tailwind CSS/PostCSS integration
    public/                       Static public assets
    data/                         Runtime SQLite database (ignored by Git)
    src/
      app/
        layout.tsx                Root document, global styles, metadata
        page.tsx                  Session restore, navigation, and view selection
        globals.css               Global styles and responsive layout rules
        api/
          auth/route.ts           Signup, login, logout, and password actions
          data/route.ts           Authenticated record load and mutation API
      components/
        AuthView.tsx              Signup, login, and password reset UI
        FeatureViews.tsx          Overview, finance, habits, tasks, goals, settings
        ModuleView.tsx            Shared tracking modules and reports
      lib/
        data-service.ts           Domain operations, filtering, and calculations
        storage.ts                Client cache and /api/data adapter
        types.ts                  Shared record and domain types
        utils.ts                  Date, currency, and formatting helpers
        server/
          auth.ts                 Session-cookie lookup and password validation
          database.ts             SQLite schema, queries, sessions, and records
```

`lifeos-app/data/` is generated at runtime and ignored by Git. Do not add its database, WAL, or shared-memory files to commits.

## Application Architecture

### UI and navigation

`src/app/page.tsx` restores the session from `/api/auth`, loads the user's records, and chooses which view to render. `AuthView.tsx` handles authentication screens. Feature screens live in `FeatureViews.tsx`; `ModuleView.tsx` provides the shared entry form and reports for the configured tracking modules. Shared styles are in `src/app/globals.css`.

### Data flow

```text
Feature component
  -> src/lib/data-service.ts (domain operations and calculations)
  -> src/lib/storage.ts (client cache and HTTP adapter)
  -> /api/data (session check and collection/action validation)
  -> src/lib/server/database.ts (per-user SQLite records)
```

After authentication, `loadUserData()` fetches the current user's collections and hydrates the client cache. Components read and update data through `data-service.ts`; mutations are sent to `/api/data` and persisted by the server. The API associates every operation with the user resolved from the session cookie.

### API routes

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/auth` | `GET` | Return the current session's public user, or `null` |
| `/api/auth` | `POST` | Signup, login, logout, change password, or reset password, selected by the JSON `action` field |
| `/api/data` | `GET` | Load the signed-in user's record collections |
| `/api/data` | `POST` | Create, update, delete, replace, or clear records using the JSON `action` and `collection` fields |

These are Next.js App Router route handlers. They run on the Node.js runtime because the database uses `node:sqlite`.

## Data and Accounts

### Persistence model

The server creates `lifeos-app/data/lifeos.sqlite` on first database access. It uses three SQLite tables:

- `users` stores usernames, display names, and password hashes.
- `sessions` stores session-token hashes and expiration times.
- `user_records` stores JSON payloads keyed by user, collection, and record ID.

Supported record collections are `profile`, `accounts`, `categories`, `transactions`, `habits`, `habit_logs`, `goals`, `tasks`, and `tracking_entries`. Shared TypeScript interfaces are in `src/lib/types.ts`.

To back up data, stop the server and copy the `lifeos-app/data/` directory somewhere private. Do not commit it. Deleting data in Settings clears the signed-in account's records and recreates its defaults; it does not delete the account or another user's records.

### Local accounts

Create an account from the sign-in screen with a display name, a unique username, and a password between 6 and 128 characters. Passwords are hashed with Node's `scrypt`; the browser session uses an HTTP-only cookie. The first signup can import records from the legacy browser-local-storage format if that browser still contains those records. Other browsers' local storage is not automatically imported.

### Network and security scope

This project is intended for local development and trusted-network testing, not as a public internet deployment. In the current implementation, **Forgot password? resets a password using only the username**, without verifying account ownership. Do not expose the server to untrusted networks or use sensitive production data. Password reset and deployment security need to be strengthened before public hosting.

## Contributing

1. Install dependencies and start the app using the commands above.
2. Follow the existing TypeScript and React patterns. The project uses strict TypeScript and the `@/*` alias maps to `src/*`.
3. Keep UI components focused on interaction and presentation. Put reusable record operations, filtering, and calculations in `src/lib/data-service.ts`.
4. Use the data service instead of reading SQLite or calling `/api/data` directly from a feature component. Server-only database work belongs in `src/lib/server/database.ts` and route handlers.
5. When adding a record type, update its type in `src/lib/types.ts`, add it to the server's collection allowlist and initialization/loading behavior, and expose domain operations through `data-service.ts`. Keep the API's per-user ownership checks intact.
6. When adding a workspace section, update navigation and view selection in `src/app/page.tsx`. Reuse `ModuleView.tsx` for a simple tracking-entry section; use a dedicated component when the data model or workflow needs distinct behavior.
7. Update this README when commands, routes, data behavior, or supported modules change. Run lint, type checking, and a production build before submitting.

There is no automated test suite or `test` script configured at this time. Add focused tests when introducing logic with meaningful edge cases or changes to shared data behavior.

## Validation Commands

Run from `lifeos-app`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server on localhost |
| `npm run dev -- --hostname 0.0.0.0` | Start the development server for LAN access |
| `npm run lint` | Run ESLint |
| `npx tsc --noEmit --incremental false` | Type-check the project without emitting files |
| `npm run build` | Create and validate a production build |
| `npm run start` | Serve the production build |

There is currently no `npm test` command.

## Troubleshooting

- **`node:sqlite` cannot be found:** Check `node --version`; use Node.js 22.13 or later.
- **The database appears in an unexpected folder:** Start the server from `lifeos-app`. The database path is based on the process working directory.
- **Port 3000 is already in use:** Start the dev server with `npm run dev -- --port 3001` and open `http://localhost:3001`.
- **A device on the LAN cannot connect:** Confirm the server was started with `--hostname 0.0.0.0`, both devices are on a network that permits device-to-device traffic, and the browser is using the host's LAN IP rather than `0.0.0.0`.
- **Records are not shared between devices:** Confirm both devices are accessing the same running server. Records are stored on the server host, not synchronized between separate installations.
- **You need a clean dependency install:** From `lifeos-app`, run `npm ci` to install the versions in `package-lock.json`.

## Configuration and Dependencies

No environment variables are required for local development. Direct dependencies are Next.js 16, React 19, and React DOM 19. TypeScript, ESLint, and Tailwind CSS 4 are development dependencies. SQLite and password hashing use Node.js built-in modules; the lockfile records exact transitive dependency versions.
