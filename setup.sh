#!/bin/bash

# Detox - Tesseract.js Setup Script
# Downloads the required Tesseract.js files for local use

set -e

echo "🧪 Detox - Setting up Tesseract.js..."
echo ""

# Create lib directory if it doesn't exist
mkdir -p lib

# Tesseract.js version
TESSERACT_VERSION="5.1.0"
CORE_VERSION="5.1.0"

# Base URLs
CDN_BASE="https://cdn.jsdelivr.net/npm"

echo "📦 Downloading Tesseract.js v${TESSERACT_VERSION}..."

# Download main tesseract.min.js
echo "  → tesseract.min.js"
curl -sL "${CDN_BASE}/tesseract.js@${TESSERACT_VERSION}/dist/tesseract.min.js" -o lib/tesseract.min.js

# Download worker
echo "  → worker.min.js"
curl -sL "${CDN_BASE}/tesseract.js@${TESSERACT_VERSION}/dist/worker.min.js" -o lib/worker.min.js

echo ""
echo "📦 Downloading Tesseract Core v${CORE_VERSION}..."

# Download WASM core files
echo "  → tesseract-core-simd.wasm.js"
curl -sL "${CDN_BASE}/tesseract.js-core@${CORE_VERSION}/tesseract-core-simd.wasm.js" -o lib/tesseract-core-simd.wasm.js

echo "  → tesseract-core.wasm.js (fallback)"
curl -sL "${CDN_BASE}/tesseract.js-core@${CORE_VERSION}/tesseract-core.wasm.js" -o lib/tesseract-core.wasm.js

echo ""
echo "📦 Downloading trained data..."

# Download English trained data
echo "  → eng.traineddata.gz"
curl -sL "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz" -o lib/eng.traineddata.gz

echo ""
echo "✅ Setup complete!"
echo ""
echo "Files downloaded to ./lib/:"
ls -la lib/
echo ""
echo "Next steps:"
echo "  1. Open Chrome and go to chrome://extensions"
echo "  2. Enable 'Developer mode' (top right toggle)"
echo "  3. Click 'Load unpacked' and select this folder"
echo "  4. Navigate to instagram.com and try uploading an image!"

