# MEDIVRA - Secure Pharmaceutical Supply & Transfer Management

Frontend: React + TypeScript + Vite + Tailwind CSS. Backend: Node.js + Express + MySQL (`server/`).

Three roles: **ADMIN** (platform oversight, users, organizations, audit), **DISTRIBUTOR** (batches, stock, creates and dispatches transfers) and **PHARMACY** (receives transfers into its own stock).

## Status

| Area | State |
|---|---|
| Registration, login, session handling (JWT, lockout) | Implemented against the real API |
| Batches, inventory, stock adjustments | Implemented against the real API |
| Transfers: create, dispatch, receive, cancel | Implemented against the real API |
| Admin: create/update users and organizations | Implemented against the real API |
| Audit log page (paginated, filtered, organization-scoped) | Implemented against the real API |
| Dashboards (role-specific) | Data from the API |
| Profile | Read-only (the API has no self-service profile/password endpoint) |

## Setup (Windows CMD)

Prerequisites: Node.js 20+ and a running MySQL server.

```bat
cd server
npm install
copy .env.example .env
```

Edit `server\.env`: set `DB_USER`, `DB_PASSWORD`, `DB_NAME`, a `JWT_SECRET` (32+ random characters) and an `AES_SECRET` (exactly 64 hex characters):

```bat
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep `AES_SECRET` safe: it encrypts transfer notes, and losing it makes existing notes unreadable.

Create the tables (safe to re-run; uses `CREATE TABLE IF NOT EXISTS`, never drops or truncates):

```bat
npm run db:init
```

Create the first admin once. Set `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (and optionally `SEED_ADMIN_NAME`, `SEED_ADMIN_PHONE`) in `server\.env`, run it, then remove the password line:

```bat
npm run seed:admin
```

Start the API (http://localhost:5000) and the frontend (http://localhost:5173):

```bat
npm run dev
:: second CMD window, project root
npm install
npm run dev
```

If the API is not on port 5000, create `.env.local` in the project root with `VITE_API_URL=http://localhost:PORT/api`.


## How it works

- **Stock rules:** a Pending transfer reserves nothing. Stock is deducted from the sender at dispatch and added to the receiving pharmacy at receipt. Only In Transit transfers count as in transit. Cancel is only possible while Pending.
- **Transfer lifecycle:** Pending -> In Transit -> Delivered, or Pending -> Cancelled.
- **Visibility:** distributors and pharmacies see only their own organization's batches, transfers and audit entries; the admin sees the platform. The server enforces this on every request; the UI only mirrors it.
- **Registration** always creates a new organization (duplicate name returns 409). Admins can also create users and organizations from the Users page.
- **Admin limits (server rules):** a user's email, role and organization cannot be changed after creation; name, phone and status can. An admin cannot deactivate themselves or the last active admin. A temporary login lockout clears itself after the lockout period.
- **Batch deletion** does not exist (batches are traceability records). Quantity changes go through audited stock adjustments.

## API

All paths are under `/api`. Everything except register/login needs `Authorization: Bearer <token>`.

| Method | Path | Who |
|---|---|---|
| GET | `/health` | public |
| POST | `/auth/register`, `/auth/login` | public (rate limited) |
| GET | `/auth/me` | any signed-in user |
| GET/POST | `/batches`; GET/PATCH `/batches/:id` | DISTRIBUTOR writes; scoped reads |
| GET | `/inventory`, `/inventory/summary`, `/inventory/:batchId` | scoped |
| POST | `/inventory/:batchId/adjust` | DISTRIBUTOR |
| GET/POST | `/transfers`; GET `/transfers/:id` | DISTRIBUTOR creates; scoped reads |
| POST | `/transfers/:id/dispatch`, `/cancel` | sending DISTRIBUTOR |
| POST | `/transfers/:id/receive` | destination PHARMACY |
| GET | `/organizations/pharmacies` | DISTRIBUTOR, ADMIN |
| GET/POST/PATCH | `/organizations`, `/organizations/:id` | ADMIN |
| GET/POST/PATCH | `/users`, `/users/:id` | ADMIN |
| GET | `/admin/overview` | ADMIN |
| GET | `/audit-logs` | ADMIN (platform) / others (own organization) |

## Security notes

- Passwords: `SHA-512(salt || password)` with a random 32-byte salt per user, compared with `crypto.timingSafeEqual`. This follows the project specification; **for production use Argon2id or scrypt**.
- JWT (HS256, 1 hour by default) carries only `sub`, `role`, `org`. The server reloads the user, role and organization from MySQL on every request.
- Login lockout: 3 failed attempts lock the account for 30 s (configurable). Login and registration are rate limited per IP.
- The frontend keeps only the JWT, in `sessionStorage`; no user or business data is cached in the browser.
- Transfer notes are encrypted at rest with AES-256-GCM (`AES_SECRET`).


## Structure
```
src/
  App.tsx, main.tsx, store.tsx    routing, providers, API-backed data layer
  types.ts                        models
  lib/                            utils, constants, rbac rules
  services/                       api.ts (HTTP client), mappers.ts, security.ts
  components/                     Layout, shared UI, TransferActions
  pages/                          Home, Login, Register, Dashboard, AdminDashboard, Inventory,
                                  Batches, BatchForm, BatchDetails, Transfers, CreateTransfer,
                                  TransferDetails, TransferHistory, Users, Audit, Profile
server/
  src/{routes,services,validation,middleware,utils,config,db}
  scripts/                        init-db.js, seed-admin.js
  schema.sql, schema.phase2.sql   tables (idempotent)
```