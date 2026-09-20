# MEDIVRA - Secure Pharmaceutical Supply & Transfer Management

Frontend prototype. No backend yet: data lives in React state and `localStorage`.

## Run
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Demo accounts (password for all: `Medivra@123`)
| Role | Email |
|---|---|
| Admin | admin@medivra.com |
| Distributor | john.smith@medivra.com |
| Pharmacy | sarah.patel@apollopharmacy.com |

Demo flow: Login -> Dashboard -> Inventory -> Add Batch -> Transfers -> Create Transfer -> Transfer tracking -> Transfer History.
Profile -> "Reset demo data" restores the seed data.

## Security mechanisms: what exists today
| Mechanism | Prototype status | Where to connect the backend |
|---|---|---|
| SHA-512 hashing | Not implemented. No passwords are stored; login uses a demo check. | `services/security.ts` (`verifyCredentials`, `hashPassword`), `store.tsx` `login` / `register` |
| AES-256 encryption | Not implemented (placeholder no-op). | `services/security.ts` (`encryptSensitiveField`) |
| RBAC | Implemented in the UI (menu, routes, buttons, data scoping). Must be re-enforced by the API. | `lib/rbac.ts`, `App.tsx` `RequireRole` |
| Account lockout | Simulated: 3 failed attempts locks the account for 30 s. | `store.tsx` `login`, `SECURITY_CONFIG` |
| Prepared statements | Not applicable to the frontend. `BACKEND:` comments mark each DB operation. | `store.tsx` |
| Audit logging | Simulated: activity list in the store, shown on Dashboard and Transfer details. | `store.tsx` `log` / `addActivity` |

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
