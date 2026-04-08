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

cp "$FRONTEND_DIR"/*.html "$DIST_DIR/"
cp "$FRONTEND_STYLES_DIR"/*.css "$DIST_DIR/styles/"
cp "$FRONTEND_SCRIPTS_DIR"/*.js "$DIST_DIR/scripts/"

cat > "$DIST_DIR/scripts/app-config.js" <<EOF
window.APP_CONFIG = {
	API_BASE_URL: "${API_BASE_URL_VALUE}"
};
EOF

cp README.md "$DIST_DIR/"
cp docs/*.md "$DIST_DIR/docs/"
cp demo_notebook.ipynb "$DIST_DIR/"

if compgen -G "outputs/*.png" > /dev/null 2>&1; then
    cp outputs/*.png "$DIST_DIR/outputs/"
fi

cp "$FRONTEND_DIR/index.html" "$DIST_DIR/404.html"

echo "Render static site bundle created in $DIST_DIR"