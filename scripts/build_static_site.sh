#!/usr/bin/env bash

set -euo pipefail

DIST_DIR="dist"
API_BASE_URL_VALUE="${API_BASE_URL:-}"
FRONTEND_DIR="frontend"
FRONTEND_STYLES_DIR="$FRONTEND_DIR/styles"
FRONTEND_SCRIPTS_DIR="$FRONTEND_DIR/scripts"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"
mkdir -p "$DIST_DIR/outputs"
mkdir -p "$DIST_DIR/docs"
mkdir -p "$DIST_DIR/styles"
mkdir -p "$DIST_DIR/scripts"

NODE_BIN="node"
if ! command -v "$NODE_BIN" >/dev/null 2>&1; then
	if command -v node.exe >/dev/null 2>&1; then
		NODE_BIN="node.exe"
	else
		echo "Node.js is required to sync frontend heads" >&2
		exit 1
	fi
fi

"$NODE_BIN" ./scripts/sync_frontend_heads.mjs

cp "$FRONTEND_DIR"/*.html "$DIST_DIR/"
cp "$FRONTEND_STYLES_DIR"/*.css "$DIST_DIR/styles/"
cp "$FRONTEND_SCRIPTS_DIR"/*.js "$DIST_DIR/scripts/"

escaped_api_base=$(printf '%s' "$API_BASE_URL_VALUE" | sed -e 's/[\/&]/\\&/g')
sed "s|__API_BASE_URL__|$escaped_api_base|g" "$FRONTEND_SCRIPTS_DIR/app-config.js" > "$DIST_DIR/scripts/app-config.js"

cp README.md "$DIST_DIR/"
cp docs/*.md "$DIST_DIR/docs/"
cp demo_notebook.ipynb "$DIST_DIR/"

if compgen -G "outputs/*.png" > /dev/null 2>&1; then
    cp outputs/*.png "$DIST_DIR/outputs/"
fi

cp "$FRONTEND_DIR/index.html" "$DIST_DIR/404.html"

echo "Render static site bundle created in $DIST_DIR"