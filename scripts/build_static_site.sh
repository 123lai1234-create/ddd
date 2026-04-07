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

cp shared.css "$DIST_DIR/"
cp nav.js "$DIST_DIR/"

# Homepage assets
cp index.html "$DIST_DIR/"
cp index.css index-live.css index-content.css index-mpnn.css "$DIST_DIR/"
cp index.js index-ui.js index-live.js index-charts.js "$DIST_DIR/"

# Secondary page HTML
cp about_me.html "$DIST_DIR/"
cp works.html "$DIST_DIR/"
cp gene_ai.html "$DIST_DIR/"
cp ngs.html "$DIST_DIR/"
cp thesis.html "$DIST_DIR/"
cp report.html "$DIST_DIR/"
cp interview_prep.html "$DIST_DIR/"

# Secondary page CSS
cp about_me.css works.css gene_ai.css ngs.css "$DIST_DIR/"
cp report.css thesis.css interview_prep.css "$DIST_DIR/"

# Secondary page JS
cp about_me.js works.js gene_ai.js ngs.js "$DIST_DIR/"
cp thesis.js interview_prep.js "$DIST_DIR/"

cp README.md "$DIST_DIR/"
cp demo_notebook.ipynb "$DIST_DIR/"

cp outputs/*.png "$DIST_DIR/outputs/"

cp index.html "$DIST_DIR/404.html"

echo "Render static site bundle created in $DIST_DIR"