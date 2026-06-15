#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# Sync to GitHub after every merge
node scripts/github-sync.mjs
