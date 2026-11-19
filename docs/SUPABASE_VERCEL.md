# Deploy: Vercel (UI) + Supabase (Postgres) + Render (API)

| Piece | Host |
| --- | --- |
| React UI | **Vercel** |
| PostgreSQL + data | **Supabase** |
| FastAPI + nightly ingest | **Render** (long-running process; not a fit for Vercel serverless) |

## 1. Create Supabase project

1. Go to [supabase.com](https://supabase.com) → New project (pick a region close to you).
2. Project Settings → Database → copy the **URI** connection string.
   - Use the one with your DB password.
   - Prefer the **direct** host (`db.<ref>.supabase.co`) for migrations and the API pool.
3. Put it in your root `.env` (never commit):

```bash
DATABASE_URL=postgresql://postgres.[ref]:YOUR_PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
# or direct:
# DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.<ref>.supabase.co:5432/postgres
```

## 2. Load schema + data into Supabase

From the project root (with `DATABASE_URL` set to Supabase):

```bash
# Schema / views / procedures
cd backend && PYTHONPATH=. python -m app.migrate

# Option A — offline demo rows (fast)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ../sql/seed_demo.sql

# Option B — live GitHub data (needs GITHUB_TOKEN in .env)
PYTHONPATH=. python -m app.ingest --seed --limit 50
PYTHONPATH=. python -c "from app.db import execute; execute('CALL sp_refresh_analytics()')"
```

Or one shot:

```bash
./scripts/load_supabase.sh
```

## 3. Deploy API on Render (points at Supabase)

1. Render → Blueprint from this repo (`render.yaml`).
2. Set `DATABASE_URL` in the env group to the **same Supabase URI**.
3. Set OAuth, `CORS_ORIGINS=https://your-app.vercel.app`, `FRONTEND_URL`, `PUBLIC_API_URL`, `ADMIN_GITHUB_LOGINS`, `GITHUB_TOKEN`.
4. After first deploy, trigger the **repopulse-nightly** cron once (or run ingest from the Ingest page as admin).

## 4. Deploy UI on Vercel

```bash
cd frontend
npx vercel login
npx vercel link   # create/link project
npx vercel env add VITE_API_BASE production   # https://api.yourdomain.com  (Render API URL)
npx vercel --prod
```

Dashboard alternative: Import the GitHub repo → set **Root Directory** to `frontend` → add env `VITE_API_BASE` = your Render API origin → Deploy.

## 5. Wire CORS / OAuth

On the Render API service:

- `CORS_ORIGINS=https://<your-vercel-app>.vercel.app`
- `FRONTEND_URL=https://<your-vercel-app>.vercel.app`
- GitHub OAuth callback: `https://<your-api-host>/api/auth/github/callback`

## Verify

- Vercel URL loads Explore
- `https://<api>/api/health` → `{"status":"ok"}`
- Supabase Table Editor shows `repositories`, `commits`, etc.
- Sign-in + request a repo (after OAuth is configured)
