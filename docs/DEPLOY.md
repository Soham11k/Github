# Deploy RepoPulse (Render + Neon)

One-time setup (~30 minutes). After this, pushes to `main` deploy when CI passes.

## 1. Domain

Buy a domain from any registrar (~$12/year). You will use:

- `www.yourdomain.com` — static frontend
- `api.yourdomain.com` — FastAPI

Custom domains are required so the session cookie works across the site and API.

## 2. Neon Postgres (Singapore)

1. Create a project at [neon.tech](https://neon.tech) in **AWS Singapore**.
2. Create a database (Postgres 16).
3. Copy the **direct** connection string (not the pooled `-pooler` host unless you prefer it; the app uses a small connection pool).
4. Keep this as `DATABASE_URL`.

Free tier: 1 GB storage, scale-to-zero after 5 idle minutes. Nightly prune keeps the audit log small.

## 3. GitHub credentials

1. **Server PAT** (classic or fine-grained, public-repo read): create a new token for production. Revoke any token that ever lived in a local `.env` you shared.
2. **OAuth App** at GitHub → Settings → Developer settings → OAuth Apps:
   - Homepage URL: `https://www.yourdomain.com`
   - Authorization callback URL: `https://api.yourdomain.com/api/auth/github/callback`
   - Copy Client ID and Client Secret.

## 4. Render Blueprint

1. Push this repo to GitHub (already at `Soham11k/Github` or your fork).
2. In Render → New → Blueprint → connect the repo → use `render.yaml`.
3. When prompted for sync:false secrets, set:

| Variable | Example |
| --- | --- |
| `DATABASE_URL` | Neon connection string |
| `GITHUB_TOKEN` | Production PAT |
| `GITHUB_OAUTH_CLIENT_ID` | OAuth app id |
| `GITHUB_OAUTH_CLIENT_SECRET` | OAuth app secret |
| `GITHUB_OAUTH_REDIRECT_URI` | `https://api.yourdomain.com/api/auth/github/callback` |
| `FRONTEND_URL` | `https://www.yourdomain.com` |
| `PUBLIC_API_URL` | `https://api.yourdomain.com` |
| `CORS_ORIGINS` | `https://www.yourdomain.com` |
| `ADMIN_GITHUB_LOGINS` | `Soham11k` (comma-separated) |
| `VITE_API_BASE` | `https://api.yourdomain.com` |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | optional |

4. Attach custom domains on `repopulse-api` and `repopulse-web`. Add the DNS records Render shows; HTTPS certificates are issued automatically.
5. Edit the static site rewrite for `/sitemap.xml` so the destination matches your real API host (if you changed the placeholder).
6. On the **repopulse-nightly** cron job, click **Trigger run** once to bootstrap ~50 seed repos (~15 minutes).

## 5. Monitoring

1. Create a free Sentry project; paste DSNs into Render env vars.
2. Add an UptimeRobot (or similar) HTTP monitor on `https://api.yourdomain.com/api/health`.

## 6. Verify launch

- [ ] `https://www.yourdomain.com` loads Explore
- [ ] Sign in with GitHub sets a session (cookie on the API host; CORS + credentials)
- [ ] Request a repo from `/requests` and see status move to `done`
- [ ] Watch a repo; after nightly (or `CALL sp_generate_watchlist_alerts()`), alerts appear
- [ ] Badge: `https://api.yourdomain.com/api/badge/owner/repo.svg`
- [ ] Nightly cron shows a successful run in Render logs

## Local development

```bash
cp .env.example .env
# fill GITHUB_TOKEN; optional OAuth for local login
pip install -r backend/requirements.txt
cd backend && PYTHONPATH=. python -m app.migrate
PYTHONPATH=. uvicorn app.main:app --reload --port 8000
cd frontend && npm ci && npm run dev
```

Docker Compose builds the API from the repo root (no SQL bind-mounts into Postgres). Migrations run in the API entrypoint.
