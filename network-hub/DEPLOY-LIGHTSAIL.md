# Deploy Network Hub on Ubuntu (Lightsail + Docker)

Single-container deploy: **nginx** serves the React app and proxies `/api/*` to **Bun**. SQLite lives on a Docker volume at `/data/data.db`.

## Architecture

```
https://your-domain.com/          → nginx → web/dist (static)
https://your-domain.com/api/*     → nginx → Bun :8787
/var/lib/docker/.../network-hub-data → SQLite (persists across redeploys)
```

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

```bash
cd network-hub
docker compose up -d --build
docker compose ps
docker compose logs -f
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

# Backup SQLite
docker compose exec network-hub cat /data/data.db > backup-$(date +%F).db

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
