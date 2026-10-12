# MEDIVRA - Secure Pharmaceutical Supply & Transfer Management

Frontend: React + TypeScript + Vite + Tailwind. Backend: Node.js + Express + MySQL (`server/`).

**Status:** Phase 1 (database setup + authentication) is real. Batches, inventory, transfers and activity are still prototype data in React state / `localStorage`.

## Phase 1: setup (Windows CMD)

Prerequisites: Node.js 20+ and MySQL running locally with an empty or existing database named `medivra`.

```bat
cd C:\Users\shkma\Desktop\Medivra\server
npm install
copy .env.example .env
```

Edit `server\.env`: set `DB_USER`, `DB_PASSWORD`, and a `JWT_SECRET` (32+ random characters):

```bat
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Create the tables (safe to re-run, never drops or changes existing data):

```bat
npm run db:init
```

Create the first admin (one time). Put `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` (and optionally `SEED_ADMIN_NAME`, `SEED_ADMIN_PHONE`) in `server\.env`, then run the command below and delete the password line from `.env` afterwards:

```bat
npm run seed:admin
```

Start the API (http://localhost:5000) and the frontend (http://localhost:5173):

```bat
npm run dev
:: in a second CMD window
cd C:\Users\shkma\Desktop\Medivra
npm install
npm run dev
```

If the API is not on port 5000, create `.env.local` in the project root with `VITE_API_URL=http://localhost:PORT/api`.

### Existing tables
`schema.sql` uses `CREATE TABLE IF NOT EXISTS`, so a pre-existing `users` or `organizations` table is left exactly as it is. If your old tables have a different structure, either create the new ones under another database name, or migrate by hand: add the missing columns/constraints with `ALTER TABLE` (copy them from `schema.sql`), back up first (`mysqldump medivra > backup.sql`), and make sure every existing row gets a unique 64-hex `password_salt` and a `password_hash` created by this app (old hashes will not verify).

### Tests
```bat
cd server
npm test
```
Tests run against a separate database (`medivra_test`, created automatically; change with `TEST_DB_NAME`), so your `medivra` data is never touched. They set a 2-second lockout so the "unlock after expiry" check is quick. The real lockout is 30 seconds (`LOCKOUT_SECONDS`).

### API (Phase 1)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register` | DISTRIBUTOR / PHARMACY only. Creates a new organization + user. |
| POST | `/api/auth/login` | Returns `{ token, user }`. 3 failed attempts lock the account for 30 s (HTTP 429). |
| GET | `/api/auth/me` | `Authorization: Bearer <token>`. Returns the user as currently stored in the database. |

### Security notes
- Passwords: `SHA-512(salt || password)`, 32-byte random salt per user, both stored as lowercase hex; compared with `crypto.timingSafeEqual`. This follows the project specification. **For production, use Argon2id or scrypt** (a single SHA-512 round is too fast to resist offline guessing).
- JWT (HS256, 1 hour by default) carries only `sub`, `role`, `org`. The middleware reloads the user, role and organization from MySQL on every request (`loadActiveUser` in `server/src/services/user.service.js`); token claims are never the final authority.
- Registration never joins an existing organization; it creates a new one (a duplicate name returns 409). Registration is open immediately in Phase 1; set `REGISTRATION_REQUIRES_APPROVAL=true` to start accounts as INACTIVE once admin activation exists.
- The frontend keeps the JWT in `sessionStorage` (cleared when the tab closes). Real accounts do not see the old demo data in org-scoped pages until the inventory/transfer phases connect those pages to MySQL.

## Structure
```
src/
  App.tsx, main.tsx, store.tsx   routing, providers, data layer (swap for API calls later)
  types.ts, data/mock.ts         models and seed data
  lib/                           utils, rbac rules
  services/security.ts           security config + backend placeholders
  components/                    Layout, shared UI, TransferActions
  pages/                         Login, Register, Dashboard, Inventory, Batches, BatchForm,
                                 BatchDetails, Transfers, CreateTransfer, TransferDetails,
                                 TransferHistory, Users, Profile
```
