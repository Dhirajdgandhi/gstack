# Network Hub

Private **Network & Upcoming Calls** dashboard:

- **Username/password auth** — each user has a private contact network
- **Axon AI calendar sync** — OAuth2, shared team calendar only (not primary)
- **Proactive LinkedIn** — after sync, prompts for people like "Meet with Ayushi"
- **Markdown notes** — paste from Google Docs; formatting preserved
- **LinkedIn enrichment** — PDF upload or optional Proxycurl URL fetch
- Meeting prep, debrief loop, networking advisor

## Setup

```bash
cd network-hub
cp .env.example .env   # add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
bun install && cd web && bun install && cd ..
bun run dev
```

- App: http://localhost:5173
- API: http://localhost:8787

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
server/   Bun API — auth, SQLite, Google Calendar, LinkedIn, link suggestions
web/      React + Vite — dashboard, network, advisor, settings
cli/      network-hub.ts — terminal entrypoint
```

Data: `~/.network-hub/data.db`
