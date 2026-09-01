#!/usr/bin/env bash
# Re-alias donttalk.vercel.app to the most recent deploy that has music/.
# Auto-discovers the newest "music LRC 200 OK" deploy via Vercel CLI.
#
# Why this exists:
#   Vercel Hobby plan auto-deploys on git push to release branch. Each new
#   production deploy steals the donttalk.vercel.app alias, but most new
#   deploys don't include astro/dist/music/* (Vercel doesn't run a full
#   build for git-based Hobby plan deploys). This script auto-finds the
#   latest deploy where music is intact and re-aliases production to it.
#
# Triggered automatically by .githooks/post-push (after `git push release`).
# Also can be run manually:
#   bash scripts/vercel-fix-alias.sh
#
# Override:
#   PROD_DEPLOY_URL=donttalk-XXXXX bash scripts/vercel-fix-alias.sh
#   SCOPE=my-team PROD_DOMAIN=example.com bash scripts/vercel-fix-alias.sh

set -e

SCOPE="${SCOPE:-donttalk}"
PROD_DOMAIN="${PROD_DOMAIN:-donttalk.vercel.app}"
EXPLICIT_DEPLOY="${PROD_DEPLOY_URL:-}"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(cd "$(dirname "$0")/.." && pwd)")"
ASTRO_DIR="$REPO_ROOT/astro"

# OIDC token
if [ -z "$VERCEL_OIDC_TOKEN" ]; then
    OIDC_FILE="$REPO_ROOT/.vercel/.env.development.local"
    if [ -f "$OIDC_FILE" ]; then
        export VERCEL_OIDC_TOKEN="$(grep '^VERCEL_OIDC_TOKEN=' "$OIDC_FILE" | head -1 | cut -d'=' -f2- | tr -d '"')"
    fi
fi
if [ -z "$VERCEL_OIDC_TOKEN" ]; then
    echo "[vercel-fix-alias] ERROR: no VERCEL_OIDC_TOKEN set" >&2
    exit 1
fi

# URL-encoded test path: 01_兄弟本色.lrc
# Use percent-encoded version to avoid curl.exe's Chinese URL issue in Git Bash
TEST_PATH="/music/01_%E5%85%84%E5%BC%9F%E6%9C%AC%E8%89%B2.lrc"

# Pick deploy URL
if [ -n "$EXPLICIT_DEPLOY" ]; then
    PROD_DEPLOY_URL="$EXPLICIT_DEPLOY"
    echo "[vercel-fix-alias] Using explicit deploy: $PROD_DEPLOY_URL"
else
    echo "[vercel-fix-alias] Looking for latest deploy with music..."
    DEPLOY_LINES=$(cd "$ASTRO_DIR" && npx vercel ls --scope "$SCOPE" 2>&1)
    PROD_DEPLOY_URL=""
    checked_count=0
    while IFS= read -r line; do
        candidate="$(echo "$line" | grep -oE 'donttalk-[a-z0-9]+-donttalk\.vercel\.app' | head -1)"
        [ -z "$candidate" ] && continue
        http_code=$(curl.exe -sI -o /dev/null -w "%{http_code}" "https://${candidate}${TEST_PATH}" 2>/dev/null || echo "000")
        if [ "$http_code" = "200" ]; then
            PROD_DEPLOY_URL="$candidate"
            echo "[vercel-fix-alias] Found working deploy: $PROD_DEPLOY_URL"
            break
        else
            echo "[vercel-fix-alias]   skip $candidate (HTTP $http_code)"
        fi
        checked_count=$((checked_count + 1))
        [ "$checked_count" -ge 8 ] && break
    done <<< "$DEPLOY_LINES"

    if [ -z "$PROD_DEPLOY_URL" ]; then
        echo "[vercel-fix-alias] ERROR: no working deploy with music found" >&2
        exit 1
    fi
fi

# Run vercel alias
cd "$ASTRO_DIR"
npx vercel alias "$PROD_DEPLOY_URL" "$PROD_DOMAIN" --scope "$SCOPE" 2>&1

echo ""
echo "[vercel-fix-alias] Done. $PROD_DOMAIN → $PROD_DEPLOY_URL"
