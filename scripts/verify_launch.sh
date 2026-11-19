#!/usr/bin/env bash
# Local smoke checks for the public-launch stack.
# For the live domain checklist, see docs/DEPLOY.md §6.
set -euo pipefail

API="${PUBLIC_API_URL:-http://127.0.0.1:8000}"

echo "==> Health"
curl -fsS "$API/api/health" | tee /tmp/repopulse-health.json
echo

echo "==> Dashboard"
curl -fsS "$API/api/dashboard" >/dev/null
echo "    ok"

echo "==> Badge SVG"
curl -fsS "$API/api/badge/facebook/react.svg" | head -c 80
echo "…"

echo "==> Sitemap"
curl -fsS "$API/api/sitemap.xml" | head -n 3
echo

echo "==> Me (anonymous)"
curl -fsS "$API/api/me"
echo

echo "Local smoke OK. Complete the live checklist in docs/DEPLOY.md after Render/Neon setup."
