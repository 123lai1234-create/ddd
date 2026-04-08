#!/usr/bin/env bash

set -euo pipefail

DIST_DIR="dist"
API_BASE_URL_VALUE="${API_BASE_URL:-}"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"
mkdir -p "$DIST_DIR/outputs"
mkdir -p "$DIST_DIR/docs"
mkdir -p "$DIST_DIR/styles"
mkdir -p "$DIST_DIR/scripts"

cat > "$DIST_DIR/scripts/app-config.js" <<EOF
window.APP_CONFIG = {
	API_BASE_URL: "${API_BASE_URL_VALUE}"
};
EOF

FRONTEND_DIR="frontend"
FRONTEND_STYLES_DIR="$FRONTEND_DIR/styles"
FRONTEND_SCRIPTS_DIR="$FRONTEND_DIR/scripts"

cp "$FRONTEND_STYLES_DIR/shared.css" "$DIST_DIR/styles/"
cp "$FRONTEND_SCRIPTS_DIR/nav.js" "$DIST_DIR/scripts/"

# Homepage assets
cp "$FRONTEND_DIR/index.html" "$DIST_DIR/"
cp "$FRONTEND_STYLES_DIR/index.css" "$FRONTEND_STYLES_DIR/index-live.css" "$FRONTEND_STYLES_DIR/index-content.css" "$FRONTEND_STYLES_DIR/index-mpnn.css" "$DIST_DIR/styles/"
cp "$FRONTEND_SCRIPTS_DIR/index.js" "$FRONTEND_SCRIPTS_DIR/index-ui.js" "$FRONTEND_SCRIPTS_DIR/index-live.js" "$FRONTEND_SCRIPTS_DIR/index-charts.js" "$DIST_DIR/scripts/"

# Secondary page HTML
cp "$FRONTEND_DIR/about_me.html" "$DIST_DIR/"
cp "$FRONTEND_DIR/works.html" "$DIST_DIR/"
cp "$FRONTEND_DIR/gene_ai.html" "$DIST_DIR/"
cp "$FRONTEND_DIR/ngs.html" "$DIST_DIR/"
cp "$FRONTEND_DIR/thesis.html" "$DIST_DIR/"
cp "$FRONTEND_DIR/report.html" "$DIST_DIR/"
cp "$FRONTEND_DIR/interview_prep.html" "$DIST_DIR/"

# Secondary page CSS
cp "$FRONTEND_STYLES_DIR/about_me.css" "$FRONTEND_STYLES_DIR/works.css" "$FRONTEND_STYLES_DIR/gene_ai.css" "$FRONTEND_STYLES_DIR/ngs.css" "$DIST_DIR/styles/"
cp "$FRONTEND_STYLES_DIR/report.css" "$FRONTEND_STYLES_DIR/thesis.css" "$FRONTEND_STYLES_DIR/interview_prep.css" "$DIST_DIR/styles/"

# Secondary page JS
cp "$FRONTEND_SCRIPTS_DIR/about_me.js" "$FRONTEND_SCRIPTS_DIR/works.js" "$FRONTEND_SCRIPTS_DIR/gene_ai.js" "$FRONTEND_SCRIPTS_DIR/ngs.js" "$DIST_DIR/scripts/"
cp "$FRONTEND_SCRIPTS_DIR/thesis.js" "$FRONTEND_SCRIPTS_DIR/interview_prep.js" "$DIST_DIR/scripts/"

cp README.md "$DIST_DIR/"
cp docs/*.md "$DIST_DIR/docs/"
cp demo_notebook.ipynb "$DIST_DIR/"

cp outputs/*.png "$DIST_DIR/outputs/"

cp "$FRONTEND_DIR/index.html" "$DIST_DIR/404.html"

echo "Render static site bundle created in $DIST_DIR"