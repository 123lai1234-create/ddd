#!/usr/bin/env bash
# Forwarder: delegates to astro build. Output at astro/dist/.

set -euo pipefail

cd "$(dirname "$0")/.."
cd astro
npm install
npm run build
echo "Built astro site at astro/dist/."
