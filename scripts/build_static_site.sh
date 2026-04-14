#!/usr/bin/env bash
# Forwarder: delegates to astro build so any platform (Vercel/Cloudflare Pages)
# still configured to run this script keeps working.

set -euo pipefail

cd "$(dirname "$0")/.."
cd astro
npm install
npm run build

# Mirror output to root dist/ for platforms that expect /dist
rm -rf ../dist
cp -r dist ../dist
echo "Built astro site; copied to ../dist for legacy output paths."
