#!/bin/bash

# Download deployed app from potato-jumper.pages.dev and extract to dist/public
set -e

DEPLOY_URL="https://potato-jumper.pages.dev"
OUTPUT_DIR="dist/public"

echo "Downloading app from $DEPLOY_URL..."

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Download the main index.html
curl -f "$DEPLOY_URL/index.html" -o "$OUTPUT_DIR/index.html" || {
  echo "Error: Failed to download index.html from $DEPLOY_URL"
  exit 1
}

# Download assets if they exist (adjust paths as needed based on actual deployment structure)
# This is a basic example - adjust based on your actual deployment structure
echo "Downloading assets..."

# Attempt to download common asset directories
for dir in assets css js images; do
  echo "Checking for /$dir directory..."
  curl -s -I "$DEPLOY_URL/$dir/" > /dev/null 2>&1 && {
    echo "Found /$dir, downloading..."
    mkdir -p "$OUTPUT_DIR/$dir"
    # Note: curl doesn't recursively download directories, so you may need to:
    # 1. Use wget instead: wget -r --no-parent -P "$OUTPUT_DIR" "$DEPLOY_URL/$dir/"
    # 2. Or manually copy specific files you know exist
  } || echo "/$dir not found"
done

echo "Download complete! Files saved to $OUTPUT_DIR"
echo "Note: If assets are missing, you may need to manually download from $DEPLOY_URL"
echo "Or use: wget -r --no-parent -P dist/public https://potato-jumper.pages.dev"
