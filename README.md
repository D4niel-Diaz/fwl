# Faculty Workload (FWL)

A faculty teaching-load management app: track faculty, courses, course
sections per term, and which faculty are assigned to which sections, with a
dashboard showing each person's total load against their contracted max.

## Stack

- `client/` — React + TypeScript + Vite, React Router
- `server/` — Node + Express + TypeScript, Prisma ORM, PostgreSQL

## Data model

- **User** — name, email, password hash, role (`user` / `admin`)
- **Faculty** — name, email, department, employment type, max load (hours/term)
- **Course** — code, title, credit hours, department
- **Term** — name, start/end dates (e.g. "2026 - 1st Semester")
- **Section** — a course offered in a term, with a section number and capacity
- **Assignment** — a faculty member assigned to a section, with a role
  (primary/co-instructor) and the load hours counted toward their total

The dashboard sums each faculty member's `loadHours` across assignments in
the selected term and compares it to their `maxLoad`, flagging them as
under / at / over capacity. Admins see an "Admin Dashboard" with summary
stats and quick-add links; everyone else sees a simpler view-only "Load
Dashboard".

## Authentication & roles

The app requires sign-in. Anyone can register at `/register` as a **user**;
registering as **admin** requires the `ADMIN_INVITE_CODE` from `server/.env`
(admin sign-up is disabled when it's empty):

- **admin** — full CRUD on faculty, courses, terms, sections, and assignments
- **user** — view-only: can see the dashboard and all entity lists, but add/edit/delete controls are hidden and the API rejects write requests with 403

Auth is JWT-based (`server/src/middleware/auth.ts`): `/api/auth/register` and
`/api/auth/login` issue a token, which the client stores in `localStorage`
and sends as `Authorization: Bearer <token>` on every request
(`client/src/api.ts`). `requireAuth` gates all `/api/*` data routes;
`requireAdmin` additionally gates POST/PUT/DELETE on them. There's no
email verification or password reset — registration is open to anyone who
can reach the app.

## Running locally

Requires a local PostgreSQL instance.

**Server** (http://localhost:4000):

```bash
cd server
cp .env.example .env   # edit DATABASE_URL / JWT_SECRET as needed
npm install
npx prisma migrate deploy   # applies the schema to your Postgres database
npm run seed                 # optional: adds sample faculty/courses/sections
npm run dev
```

**Client** (http://localhost:5173):

```bash
cd client
npm install
npm run dev
```

The client defaults to calling the API at `http://localhost:4000/api`
(`client/src/api.ts`); override with `VITE_API_BASE_URL`. A production build
(`npm run build`) instead picks up `client/.env.production`, which sets it to
`/api` — see the deployment architecture below.

## Deploying to AWS EC2 (Ubuntu) — no Docker

Everything runs as plain OS processes on one Ubuntu instance: PostgreSQL and
the Node API installed directly on the box, the API kept alive with PM2, and
Nginx serving the built client and reverse-proxying `/api/*` to the API
process on `127.0.0.1:4000` (which isn't exposed to the internet directly).

```
Browser → Nginx :80 → /          → static files (client/dist)
                     → /api/*    → Node API on 127.0.0.1:4000 (PM2) → PostgreSQL (localhost)
```

**See [DEPLOYMENT.md](./DEPLOYMENT.md)** for the full step-by-step — AWS
Console setup (key pair, free-tier-eligible instance, security group),
installing Node/PostgreSQL/Nginx/PM2, configuring and building the app,
wiring up Nginx, the GitHub Actions secrets for auto-deploy, and how to stay
within AWS Free Tier limits.

## Project structure

```
server/
  prisma/schema.prisma      data model (incl. User), PostgreSQL datasource
  prisma/migrations/        SQL migrations (run via `prisma migrate deploy`)
  prisma/seed.ts            sample faculty/courses/sections (no users)
  src/middleware/auth.ts    requireAuth / requireAdmin, JWT signing
  src/routes/auth.ts        register / login / me
  src/routes/               REST endpoints (faculty, courses, terms, sections, assignments, loads)
  src/index.ts              Express app entry point, binds to 127.0.0.1 only
  ecosystem.config.js       PM2 process config
client/
  src/auth/                 AuthContext (login/register/logout state) + ProtectedRoute
  src/pages/                Login, Register, AdminDashboard, UserDashboard, one page per entity
  src/components/           NavBar, TermSelect, FacultyLoadList
  src/hooks/useTermLoads.ts shared term + load-list fetching
  src/api.ts                fetch wrapper (configurable base URL, attaches the auth token, handles 401)
  src/types.ts              shared TS types matching the API shapes
  .env.production           VITE_API_BASE_URL=/api, picked up by `npm run build`
deploy/nginx.conf            Nginx site config: serves client/dist, proxies /api/* to 127.0.0.1:4000
.github/workflows/deploy.yml build check (all branches) + SSH deploy to EC2 (main only)
```

## Possible next steps

- Approval workflow (draft → submitted → approved) for proposed loads
- Overload-pay calculation and export/reporting per department
- TLS termination (Certbot or an ALB) in front of the EC2 instance
- Restrict server-side CORS to the deployed domain (low risk today since the API only listens on `127.0.0.1` and Nginx proxies same-origin)
- Automate steps 2–3 and 7 with a provisioning script or config management tool, since the GitHub Actions workflow only handles the repeatable parts (pull, build, migrate, reload)
