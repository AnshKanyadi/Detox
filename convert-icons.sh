#!/bin/bash

# Detox - Icon Conversion Script
# Converts SVG icons to PNG format required by Chrome extensions

set -e

echo "🎨 Detox - Converting icons to PNG..."
echo ""

cd icons

# Check if we have a tool to convert SVGs
if command -v convert &> /dev/null; then
    echo "Using ImageMagick..."
    convert -background none icon16.svg icon16.png
    convert -background none icon48.svg icon48.png
    convert -background none icon128.svg icon128.png
elif command -v rsvg-convert &> /dev/null; then
    echo "Using rsvg-convert..."
    rsvg-convert -w 16 -h 16 icon16.svg -o icon16.png
    rsvg-convert -w 48 -h 48 icon48.svg -o icon48.png
    rsvg-convert -w 128 -h 128 icon128.svg -o icon128.png
elif command -v inkscape &> /dev/null; then
    echo "Using Inkscape..."
    inkscape icon16.svg --export-filename=icon16.png -w 16 -h 16
    inkscape icon48.svg --export-filename=icon48.png -w 48 -h 48
    inkscape icon128.svg --export-filename=icon128.png -w 128 -h 128
else
    echo "⚠️  No SVG converter found!"
    echo ""
    echo "Please install one of the following:"
    echo "  - ImageMagick: brew install imagemagick"
    echo "  - librsvg: brew install librsvg"
    echo "  - Inkscape: brew install inkscape"
    echo ""
    echo "Or manually convert the SVG files in icons/ to PNG format."
    echo ""
    echo "Alternative: Use an online converter like https://svgtopng.com"
    exit 1
fi

echo ""
echo "✅ Icons converted successfully!"
ls -la *.png

