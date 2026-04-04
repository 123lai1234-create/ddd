#!/usr/bin/env bash

set -euo pipefail

DIST_DIR="dist"
API_BASE_URL_VALUE="${API_BASE_URL:-}"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"
mkdir -p "$DIST_DIR/outputs"

cat > "$DIST_DIR/app-config.js" <<EOF
window.APP_CONFIG = {
	API_BASE_URL: "${API_BASE_URL_VALUE}"
};
EOF

cp index.html "$DIST_DIR/"
cp about_me.html "$DIST_DIR/"
cp works.html "$DIST_DIR/"
cp gene_ai.html "$DIST_DIR/"
cp ngs.html "$DIST_DIR/"
cp report.html "$DIST_DIR/"
cp interview_prep.html "$DIST_DIR/"
cp README.md "$DIST_DIR/"
cp demo_notebook.ipynb "$DIST_DIR/"

cp outputs/*.png "$DIST_DIR/outputs/"

cp index.html "$DIST_DIR/404.html"

echo "Render static site bundle created in $DIST_DIR"