# Network Hub

Private **Network & Upcoming Calls** dashboard:

- **Google sign-in** — team roster via `TEAM_EMAILS`; optional username/password in local dev
- **Axon AI calendar sync** — OAuth2, shared team calendar only (not primary)
- **Proactive LinkedIn** — after sync, prompts for people like "Meet with Ayushi"
- **Markdown notes** — paste from Google Docs; formatting preserved
- **LinkedIn enrichment** — PDF upload or optional Proxycurl URL fetch
- Meeting prep, debrief loop, networking advisor

## Prerequisites

- [Bun](https://bun.sh) (API + dev tooling)
- PostgreSQL (local install, Docker, or remote EC2)
- Google OAuth credentials ([`.env.example`](./.env.example))

```bash
cd network-hub
cp .env.example .env   # fill in Google OAuth + database settings
bun install && cd web && bun install && cd ..
```

## Run locally

Both modes use **`bun run dev`**: Vite on **http://localhost:5173** (UI) and the API on **http://localhost:8787**. The UI proxies `/api` to the API in dev.

Google OAuth redirect URI (local dev):

```
http://localhost:8787/api/auth/google/callback
```

Run migrations once after the database is reachable:

```bash
bun docker/db-init.ts
```

### Option A — local servers + local PostgreSQL

**1. Start Postgres** (pick one):

```bash
# Docker (bundled with this repo)
docker compose up postgres -d
```

Or use a Postgres install you already have on the machine (Homebrew, Postgres.app, etc.).

**2. Point `.env` at local Postgres**

With Docker Compose Postgres (defaults from [`docker-compose.yml`](./docker-compose.yml)):

```bash
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=networkhub
DATABASE_PASSWORD=networkhub
DATABASE_NAME=networkhub
```

With your own local install, set the same variables to match your user/database.

**3. Migrate and run**

```bash
bun docker/db-init.ts
bun run dev
```

- App: http://localhost:5173  
- API: http://localhost:8787  

Optional: username/password login in dev — set `ALLOW_PASSWORD_AUTH=1` in `.env`.

### Option B — local servers + EC2 PostgreSQL

Run the API and Vite on your laptop; store data on Postgres on a remote EC2 (or RDS).

**1. On the DB host** — Postgres listening on `5432`, security group allows **your dev machine’s public IP** on port 5432.

**2. In `.env` on your laptop**

```bash
DATABASE_HOST=YOUR_DB_EC2_PUBLIC_IP
DATABASE_PORT=5432
DATABASE_USER=appuser
DATABASE_PASSWORD=your-password
DATABASE_NAME=myapp_db
# Or: DATABASE_URL=postgresql://appuser:PASSWORD@YOUR_DB_EC2_PUBLIC_IP:5432/myapp_db
```

**3. Migrate and run**

```bash
bun docker/db-init.ts
bun run dev
```

Same URLs as Option A: http://localhost:5173 (UI), http://localhost:8787 (API).

If the DB already has an unrelated `users` table, the migrator renames it to `legacy_users_pre_network_hub` and creates a fresh Network Hub schema.

**Connection refused?** Check EC2 security group, `listen_addresses` in `postgresql.conf`, and `pg_hba.conf` on the DB instance.

## CLI

Every capability is available from the terminal (same as Cursor skills):

```bash
bun run cli -- login --username YOU --password PASS
bun run cli -- calendar sync
bun run cli -- calendar link-suggestions
bun run cli -- contacts list --query ayushi
bun run cli -- contacts add --name "Ayushi" --linkedin https://linkedin.com/in/...
bun run cli -- meetings upcoming
bun run cli -- meetings link --meeting-id gcal-XXX --name Ayushi --linkedin URL
bun run cli -- advisor suggestions
```

Token saved to `~/.network-hub/cli-token`. Override API with `NETWORK_HUB_API`.

## Cursor skills

`.cursor/skills/network-hub*` — invoke in Cursor or read for agent workflows:

| Skill | Purpose |
|-------|---------|
| `network-hub` | Orchestrator + CLI index |
| `network-hub-calendar` | Axon AI calendar sync |
| `network-hub-contacts` | CRM + LinkedIn import |
| `network-hub-linkedin-enrich` | Proactive LinkedIn after sync |
| `network-hub-meeting-prep` | Prep/debrief + markdown notes |
| `network-hub-advisor` | Networking suggestions |

## Connect calendar

Settings → **Connect Google Calendar** → Dashboard → **Sync Axon AI calendar**

Your Google account must have access to the Axon AI shared calendar.

## Architecture

```
server/   Bun API — auth, PostgreSQL, Google Calendar, LinkedIn, link suggestions
web/      React + Vite — dashboard, network, advisor, settings
cli/      network-hub.ts — terminal entrypoint
```

Data: PostgreSQL via `DATABASE_URL` or `DATABASE_HOST` + `DATABASE_USER` + `DATABASE_PASSWORD` + `DATABASE_NAME` (same env names for local, Docker, and AWS RDS).

## Deploy on Ubuntu / Lightsail (Docker)

See **[DEPLOY-LIGHTSAIL.md](./DEPLOY-LIGHTSAIL.md)** — app + optional bundled Postgres, or **[`docker-compose.app.yml`](./docker-compose.app.yml)** when Postgres runs on a separate EC2.

```bash
cd network-hub
cp .env.example .env   # set DATABASE_*, JWT_SECRET, Google OAuth, TEAM_EMAILS
docker compose -f docker-compose.app.yml run --rm db-init
docker compose -f docker-compose.app.yml up -d --build
```

App: http://localhost:8787 (UI + API on one port)

## Deploy on Vercel

See **[DEPLOY.md](./DEPLOY.md)** for full steps. Summary:

1. Set Vercel **Root Directory** to `network-hub`
2. Add env vars: `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
3. Deploy — build uses `npm run build --prefix web` (no Bun required at build time)
4. API runs as Bun serverless at `/api/*`

```bash
cd network-hub && npx vercel --prod
```
