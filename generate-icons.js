#!/usr/bin/env node

/**
 * Detox - Simple PNG Icon Generator
 * Generates basic PNG icons without external dependencies
 */

const fs = require('fs');
const path = require('path');

// Simple PNG encoder (creates a basic colored square with transparency)
function createPNG(width, height, color) {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk (image header)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type (RGBA)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = createChunk('IHDR', ihdrData);
  
  // Create image data (RGBA)
  const rawData = [];
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 2;
  
  for (let y = 0; y < height; y++) {
    rawData.push(0); // Filter type: None
    for (let x = 0; x < width; x++) {
      // Check if pixel is inside rounded rectangle
      const cornerRadius = width * 0.2;
      const inside = isInsideRoundedRect(x, y, 1, 1, width - 2, height - 2, cornerRadius);
      
      // Shield icon check (simplified)
      const shieldInside = isInsideShield(x, y, width, height);
      
      if (inside) {
        if (shieldInside) {
          // Dark color for shield icon
          rawData.push(10, 10, 11, 255); // #0a0a0b
        } else {
          // Gradient from #00d4aa to #00a086
          const t = (x + y) / (width + height);
          const r = 0;
          const g = Math.round(212 - t * (212 - 160));
          const b = Math.round(170 - t * (170 - 134));
          rawData.push(r, g, b, 255);
        }
      } else {
        rawData.push(0, 0, 0, 0); // Transparent
      }
    }
  }
  
  // Compress with zlib
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(rawData), { level: 9 });
  const idat = createChunk('IDAT', compressed);
  
  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function isInsideRoundedRect(x, y, rx, ry, rw, rh, radius) {
  // Check corners
  if (x < rx + radius && y < ry + radius) {
    return Math.hypot(x - rx - radius, y - ry - radius) <= radius;
  }
  if (x > rx + rw - radius && y < ry + radius) {
    return Math.hypot(x - rx - rw + radius, y - ry - radius) <= radius;
  }
  if (x < rx + radius && y > ry + rh - radius) {
    return Math.hypot(x - rx - radius, y - ry - rh + radius) <= radius;
  }
  if (x > rx + rw - radius && y > ry + rh - radius) {
    return Math.hypot(x - rx - rw + radius, y - ry - rh + radius) <= radius;
  }
  
  return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
}

function isInsideShield(x, y, w, h) {
  // Simplified shield shape detection
  const cx = w / 2;
  const cy = h / 2;
  const scale = w / 24; // Original icon was 24x24
  
  // Shield outline (very simplified)
  const shieldTop = h * 0.2;
  const shieldBottom = h * 0.85;
  const shieldLeft = w * 0.2;
  const shieldRight = w * 0.8;
  
  // Inside the shield body
  if (y >= shieldTop && y <= shieldBottom && x >= shieldLeft && x <= shieldRight) {
    // Check if in the "notch" area (bottom of shield)
    const bottomNotch = h * 0.65;
    if (y > bottomNotch) {
      // Triangular bottom
      const progress = (y - bottomNotch) / (shieldBottom - bottomNotch);
      const narrowing = progress * (shieldRight - shieldLeft) * 0.4;
      if (x < shieldLeft + narrowing || x > shieldRight - narrowing) {
        return false;
      }
    }
    
    // Check cutout area (half-shield effect)
    if (x < cx && y > h * 0.45 && y < h * 0.7) {
      return false;
    }
    
    return true;
  }
  
  return false;
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type);
  const combined = Buffer.concat([typeBuffer, data]);
  
  const crc = crc32(combined);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  
  return Buffer.concat([length, combined, crcBuffer]);
}

// CRC32 implementation
function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  const table = getCRC32Table();
  
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xFF];
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

let crc32Table = null;
function getCRC32Table() {
  if (crc32Table) return crc32Table;
  
  crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc32Table[i] = c;
  }
  return crc32Table;
}

// Main
const iconsDir = path.join(__dirname, 'icons');

console.log('🎨 Generating PNG icons...\n');

const sizes = [16, 48, 128];

sizes.forEach(size => {
  const png = createPNG(size, size);
  const filename = `icon${size}.png`;
  fs.writeFileSync(path.join(iconsDir, filename), png);
  console.log(`  ✓ ${filename} (${png.length} bytes)`);
});

console.log('\n✅ Icons generated successfully!');

