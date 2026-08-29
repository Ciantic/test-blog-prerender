#!/usr/bin/env bash
set -euo pipefail

# Deploy the prerendered site in dist/client to a Cloudflare Pages project.
#
#   https://ciantic-blog.pages.dev/
#
# Uses `wrangler pages deploy`, the official Cloudflare CLI.
#
# One-time setup: create the Pages project (or it's created on first deploy):
#   npx wrangler pages project create ciantic-blog
#
# One-time auth: run `npx wrangler login` (or set CLOUDFLARE_API_TOKEN /
# CLOUDFLARE_ACCOUNT_ID, see
# https://developers.cloudflare.com/workers/wrangler/system-environment-variables/).

PROJECT="ciantic-blog"
DIST_DIR="dist/client"
BRANCH="main"

pnpm build

if [[ ! -d "$DIST_DIR" ]]; then
  echo "error: build output '$DIST_DIR' not found. Run 'pnpm build' first (or pass the dist dir as the first argument)." >&2
  exit 1
fi

echo "==> Deploying '$DIST_DIR' to Cloudflare Pages project '$PROJECT' (branch '$BRANCH')"

npx wrangler pages deploy "$DIST_DIR" \
  --project-name "$PROJECT" \
  --branch "$BRANCH"
