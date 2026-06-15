# Deploy Network Hub on Ubuntu (Lightsail + Docker)

Single-container deploy: **nginx** serves the React app and proxies `/api/*` to **Bun**. Data lives in **PostgreSQL**.

## Database initialization (Docker)

Tables are created automatically — no manual SQL.

| Setup | Command |
|-------|---------|
| **App EC2 → remote DB EC2** | `docker compose -f docker-compose.app.yml run --rm db-init` |
| **Auto on app start** | entrypoint runs migrations before API starts |
| **Local dev + bundled Postgres** | `docker compose up -d --build` |

## Architecture (two EC2 instances)

```
App EC2 (this server)              DB EC2 (3.143.209.228)
┌─────────────────────────┐         ┌──────────────────────┐
│ Docker: network-hub     │  :5432  │ PostgreSQL           │
│ nginx :80 → Bun API     │ ──────► │ myapp_db / appuser   │
└─────────────────────────┘         └──────────────────────┘
```

Use `docker-compose.app.yml` — it reads `DATABASE_HOST` from `.env` and does **not** run Postgres locally.

## Remote database wiring

**On the DB EC2** (Postgres server):

1. Security group — allow inbound **TCP 5432** from the **App EC2 security group** (best) or App EC2 private IP.
2. `postgresql.conf` — `listen_addresses = '*'` (or the private IP).
3. `pg_hba.conf` — e.g. `host myapp_db appuser APP_EC2_PRIVATE_IP/32 scram-sha-256`
4. `sudo systemctl restart postgresql`

**On the App EC2** (this server), in `.env`:

```bash
DATABASE_HOST=3.143.209.228      # DB EC2 IP (use private IP if same VPC)
DATABASE_PORT=5432
DATABASE_USER=appuser
DATABASE_PASSWORD=your-password
DATABASE_NAME=myapp_db

APP_URL=http://APP_EC2_PUBLIC_IP
API_URL=http://APP_EC2_PUBLIC_IP
GOOGLE_REDIRECT_URI=http://APP_EC2_PUBLIC_IP/api/auth/google/callback
JWT_SECRET=long-random-string
```

**Initialize tables on the remote DB from App EC2:**

```bash
cd network-hub
docker compose -f docker-compose.app.yml run --rm db-init
```

**Start the app:**

```bash
docker compose -f docker-compose.app.yml up -d --build
```

**Verify** (on DB EC2 or from App EC2 if 5432 is open to you):

```bash
PGPASSWORD='...' psql -h 3.143.209.228 -U appuser -d myapp_db -c '\dt'
curl http://localhost/api/health
```

---

## Local dev (optional bundled Postgres)

`docker-compose.yml` includes a Postgres container for local testing only:

```
DATABASE_HOST=postgres   # set by compose, not for remote EC2 setup
```

Same variable names — only `DATABASE_HOST` changes between environments.

## Architecture (single-server bundled Postgres — dev only)

## 1. Lightsail instance

- Blueprint: **Ubuntu 22.04 or 24.04 LTS** (OS only)
- Size: **$5–10/mo** is enough for a small team
- Networking → IPv4 firewall: allow **22**, **80**, **443**

## 2. Install Docker on the instance

```bash
ssh -i ~/path/to/Lightsail.pem ubuntu@YOUR_LIGHTSAIL_IP

sudo apt-get update
sudo apt-get install -y ca-certificates curl git

sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker ubuntu
newgrp docker
```

## 3. Get the code

```bash
git clone https://github.com/YOUR_ORG/gstack.git
cd gstack/network-hub
```

Or rsync from your machine:

```bash
rsync -avz -e "ssh -i ~/path/to/Lightsail.pem" \
  ./network-hub/ ubuntu@YOUR_LIGHTSAIL_IP:~/network-hub/
```

## 4. Configure environment

```bash
cp .env.example .env
nano .env
```

Required for production:

| Variable | Example |
|----------|---------|
| `APP_URL` | `http://YOUR_IP_OR_DOMAIN` |
| `API_URL` | same as `APP_URL` |
| `JWT_SECRET` | long random string |
| `GOOGLE_CLIENT_ID` | from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | from Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `http://YOUR_IP_OR_DOMAIN/api/auth/google/callback` |
| `TEAM_EMAILS` | `alice@company.com,bob@company.com` |

Use `https://` URLs once TLS is configured.

## 5. Google OAuth

In [Google Cloud Console](https://console.cloud.google.com/) → OAuth client → Web application:

- **Authorized JavaScript origins:** `http://YOUR_IP_OR_DOMAIN`
- **Authorized redirect URIs:** `http://YOUR_IP_OR_DOMAIN/api/auth/google/callback`

Enable the **Google Calendar API** for calendar sync.

## 6. Build and run

**App EC2 → remote DB EC2** (your setup):

```bash
docker compose -f docker-compose.app.yml run --rm db-init
docker compose -f docker-compose.app.yml up -d --build
```

**Local dev with bundled Postgres:**

```bash
docker compose up -d --build
```

Verify:

```bash
curl -s http://localhost/api/health
# {"ok":true}
```

Open `http://YOUR_LIGHTSAIL_IP` in a browser.

## 7. Operations

```bash
# Rebuild after git pull
git pull
docker compose up -d --build

# Logs
docker compose logs -f network-hub

# Backup: pg_dump from postgres container
docker compose exec postgres pg_dump -U networkhub networkhub > backup-$(date +%F).sql

# Stop (data volume is preserved)
docker compose down
```

## 8. HTTPS (recommended before team use)

After DNS points to the instance, terminate TLS at the host or swap nginx for Caddy in the image. Update `.env` (`APP_URL`, `API_URL`, `GOOGLE_REDIRECT_URI`) and Google OAuth URIs to `https://`.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| OAuth redirect loop / wrong redirect | `APP_URL` and `API_URL` must match the browser URL; update Google redirect URI |
| Sign-in works, no team data | Add your email to `TEAM_EMAILS` |
| Sessions reset on redeploy | Set `JWT_SECRET` in `.env` |
| Can't reach site from browser | Open port 80 in Lightsail firewall |
| API returns HTML | nginx `/api/` proxy misconfigured — check `docker compose logs` |

## Local Docker smoke test

```bash
cd network-hub
cp .env.example .env
# Set APP_URL=http://localhost and API_URL=http://localhost
docker compose up --build
```

Then open http://localhost
