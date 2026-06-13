# Deploy Network Hub on Vercel

Network Hub deploys as a **Vite static frontend** + **Bun serverless API** (`/api/*`) on one Vercel project.

## 1. Vercel project settings

| Setting | Value |
|---------|--------|
| **Root Directory** | `network-hub` (if repo is `gstack`; use `.` if this folder is the repo root) |
| **Framework Preset** | Other |
| **Build Command** | *(from `vercel.json`)* `npm run build --prefix web` |
| **Output Directory** | `web/dist` |
| **Install Command** | `npm install --prefix web && npm install` |

`vercel.json` in this folder sets these automatically when Root Directory is `network-hub`.

## 2. Environment variables

Set in Vercel → Project → Settings → Environment Variables:

| Variable | Required | Notes |
|----------|----------|--------|
| `JWT_SECRET` | **Yes** | Long random string; sessions won't survive without it |
| `GOOGLE_CLIENT_ID` | For calendar | OAuth Web client |
| `GOOGLE_CLIENT_SECRET` | For calendar | |
| `GOOGLE_REDIRECT_URI` | Optional | Defaults to `https://<your-domain>/api/auth/google/callback` |
| `OPENAI_API_KEY` | Optional | AI enrichment on save |
| `PROXYCURL_API_KEY` | Optional | LinkedIn URL fetch |

After first deploy, add your production URL to Google OAuth **Authorized redirect URIs**:

```
https://your-project.vercel.app/api/auth/google/callback
```

Also add the same origin under **Authorized JavaScript origins**.

## 3. Deploy

```bash
cd network-hub
npx vercel          # preview
npx vercel --prod   # production
```

Or connect the GitHub repo and set Root Directory to `network-hub`.

## 4. Why build failed with exit 127

Vercel's default build ran `bun run build`, but **Bun isn't guaranteed on the build image**. The fix:

- `package.json` `build` → `npm run build --prefix web` (Node + npm only)
- `vercel.json` pins install/build commands

## 5. Data persistence (important)

On Vercel, SQLite lives under `/tmp/network-hub` (ephemeral). **Data may reset** when serverless functions cold-start or redeploy.

For production persistence, plan one of:

- [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) + sync DB file
- [Turso](https://turso.tech/) (libSQL) — future migration
- Run the API on a long-lived host (Fly.io, Railway) and deploy **frontend-only** to Vercel with `API_URL` pointing at that host

For demos and personal use, `/tmp` is fine; set `JWT_SECRET` and re-create accounts after redeploys if needed.

## 6. Local vs Vercel

| | Local | Vercel |
|---|--------|--------|
| Frontend | `web` Vite :5173 | Static `web/dist` |
| API | `bun run dev:server` :8787 | `api/[[...path]].ts` Bun function |
| Database | `~/.network-hub/data.db` | `/tmp/network-hub/data.db` |

Local dev unchanged: `bun run dev`.
