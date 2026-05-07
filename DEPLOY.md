# Deploying the Leveraged ETF Dashboard

The app ships with a multi-stage `Dockerfile` and `docker-compose.yml` so it can run anywhere Docker runs (local box, VPS, Fly.io, Railway, Render, AWS ECS, GCP Cloud Run, etc.).

## Quick start (one host, one command)

```bash
docker compose up -d --build
```

Then open http://localhost:3000.

To use a different host port:

```bash
PORT=8080 docker compose up -d --build
```

## Plain Docker (no compose)

```bash
docker build -t leveraged-etf-dashboard .
docker run -d --name etf-dashboard -p 3000:3000 --restart unless-stopped leveraged-etf-dashboard
```

## How it works

- `next.config.js` has `output: 'standalone'`, which makes Next.js emit a self-contained `.next/standalone/server.js` plus only the production deps it actually uses.
- The `runner` stage is `node:20-alpine` and copies *only* the standalone output and the static assets — image is small (~150–200 MB) and starts in ~1s.
- Container listens on `0.0.0.0:3000` (set via `HOSTNAME` and `PORT`).
- Runs as the unprivileged `nextjs` user (UID 1001).

## Configuration

All trade data is persisted to **localStorage** in your browser, so no database is required to run the app. Optional API keys (`FINNHUB_API_KEY`, etc. — see `.env.example`) can be passed in via `env_file` in `docker-compose.yml` or `-e` flags on `docker run`.

## Healthcheck

`docker-compose.yml` runs `wget` against `/api/quote?symbol=SOXL` every 30s to confirm Yahoo Finance fetches still work. Adjust or remove if you don't want outbound network checks.

## Deploying to specific platforms

**Fly.io**
```bash
fly launch --no-deploy        # generates fly.toml from the Dockerfile
fly deploy
```

**Railway / Render**
Point the service at this repo. Both auto-detect the Dockerfile; set the internal port to 3000.

**Cloud Run / ECS**
```bash
docker build -t <registry>/leveraged-etf-dashboard:latest .
docker push <registry>/leveraged-etf-dashboard:latest
```
Then deploy the image with port 3000 exposed. No persistent volume needed.

## Updates

```bash
git pull
docker compose up -d --build
```
