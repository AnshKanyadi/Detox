#!/usr/bin/env node

/**
 * Detox - Tesseract.js Setup Script
 * Downloads the required Tesseract.js files for local use
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const LIB_DIR = path.join(__dirname, 'lib');

// Files to download
const FILES = [
  {
    name: 'tesseract.min.js',
    url: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js'
  },
  {
    name: 'worker.min.js',
    url: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/worker.min.js'
  },
  {
    name: 'tesseract-core-simd.wasm.js',
    url: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/tesseract-core-simd.wasm.js'
  },
  {
    name: 'tesseract-core.wasm.js',
    url: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/tesseract-core.wasm.js'
  },
  {
    name: 'eng.traineddata.gz',
    url: 'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz'
  }
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    const request = https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        downloadFile(response.headers.location, dest)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
    });
    
    request.on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
    
    file.on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('🧪 Detox - Setting up Tesseract.js...\n');
  
  // Create lib directory
  if (!fs.existsSync(LIB_DIR)) {
    fs.mkdirSync(LIB_DIR, { recursive: true });
  }
  
  console.log('📦 Downloading files...\n');
  
  for (const file of FILES) {
    const dest = path.join(LIB_DIR, file.name);
    console.log(`  → ${file.name}`);
    
    try {
      await downloadFile(file.url, dest);
      console.log(`    ✓ Downloaded`);
    } catch (error) {
      console.error(`    ✗ Failed: ${error.message}`);
      process.exit(1);
    }
  }
  
  console.log('\n✅ Setup complete!\n');
  console.log('Files downloaded to ./lib/:');
  fs.readdirSync(LIB_DIR).forEach(file => {
    const stats = fs.statSync(path.join(LIB_DIR, file));
    const size = (stats.size / 1024).toFixed(1) + ' KB';
    console.log(`  ${file.padEnd(30)} ${size}`);
  });
  
  console.log('\nNext steps:');
  console.log('  1. Open Chrome and go to chrome://extensions');
  console.log('  2. Enable "Developer mode" (top right toggle)');
  console.log('  3. Click "Load unpacked" and select this folder');
  console.log('  4. Navigate to instagram.com and try uploading an image!');
}

main().catch(console.error);

