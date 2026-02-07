/**
 * Detox Content Script
 * Intercepts file uploads on Instagram and redacts sensitive information
 * Uses Detox API backend for OCR and detection
 */

(function() {
  'use strict';

  const CONFIG = {
    blur: {
      padding: 15,      // Padding around detected text
      extraMargin: 0.15, // Add 15% extra to width/height for safety
      color: '#000000'
    },
    timeout: 180000  // 180 seconds (3 min - OCR on CPU can be slow)
  };

  let isEnabled = true;
  let isProcessing = false;
  let isHandingOff = false;  // Flag to prevent re-processing

  // ===========================================
  // Interceptor
  // ===========================================

  function initInterceptor() {
    console.log('Detox: Initializing on Instagram');

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            node.querySelectorAll?.('input[type="file"]').forEach(attachListener);
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll('input[type="file"]').forEach(attachListener);
  }

  function attachListener(input) {
    if (input.dataset.detoxAttached) return;
    input.dataset.detoxAttached = 'true';

    // Store original files before any handler runs
    let originalFiles = null;
    let processingPromise = null;

    input.addEventListener('change', function(event) {
      // Skip if we're handing off processed files
      if (isHandingOff) {
        console.log('Detox: Handoff in progress, letting through');
        return;
      }

      if (!isEnabled) {
        console.log('Detox: Disabled, skipping');
        return;
      }

      if (isProcessing) {
        console.log('Detox: Already processing, blocking');
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      const files = event.target.files;
      if (!files?.length) return;

      // IMMEDIATELY stop the event before any async work
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      // Copy files before clearing
      originalFiles = Array.from(files);
      
      // Clear the input immediately to prevent Instagram from reading it
      const dt = new DataTransfer();
      input.files = dt.files;

      console.log('Detox: Intercepted', originalFiles.length, 'file(s), starting processing...');

      isProcessing = true;
      showOverlay();

      // Process async
      processFiles(input, originalFiles);
    }, true);  // Capture phase
  }

  async function processFiles(input, files) {
    try {
      const processedFiles = [];
      
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          updateStatus('Scanning image...');
          const result = await processImage(file);
          processedFiles.push(result.file);
          
          chrome.runtime.sendMessage({
            type: 'DETOX_SCAN_COMPLETE',
            foundSensitive: result.redacted > 0
          });

          if (result.redacted > 0) {
            showNotification(`Redacted ${result.redacted} sensitive item(s)`, 'success');
          } else {
            showNotification('No sensitive info found', 'info');
          }
        } else {
          processedFiles.push(file);
        }
      }

      // Handoff to Instagram
      console.log('Detox: Handing off', processedFiles.length, 'processed file(s)');
      isHandingOff = true;
      
      const dt = new DataTransfer();
      processedFiles.forEach(f => dt.items.add(f));
      input.files = dt.files;
      
      // Small delay then dispatch
      await new Promise(r => setTimeout(r, 50));
      
      const changeEvent = new Event('change', { bubbles: true, cancelable: true });
      input.dispatchEvent(changeEvent);
      
      // Reset handoff flag
      setTimeout(() => { isHandingOff = false; }, 200);

    } catch (error) {
      console.error('Detox: Processing error', error);
      showNotification('Processing failed: ' + error.message, 'error');
      
      // On error, upload original files
      isHandingOff = true;
      const dt = new DataTransfer();
      files.forEach(f => dt.items.add(f));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(() => { isHandingOff = false; }, 200);
    } finally {
      isProcessing = false;
      hideOverlay();
    }
  }

  // ===========================================
  // Image Processing
  // ===========================================

  async function processImage(file) {
    // Convert to base64
    updateStatus('Preparing image...');
    const base64 = await fileToBase64(file);
    
    // Load image for dimensions and redaction
    const img = await loadImage(file);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // Send to API
    updateStatus('Analyzing with AI OCR...');
    const result = await analyzeWithAPI(base64);
    
    console.log('Detox: Full API response:', JSON.stringify(result, null, 2));
    
    if (!result.success) {
      console.warn('Detox: API error:', result.error);
      updateStatus('API unavailable - skipping scan');
      return { file, redacted: 0 };
    }

    if (!result.detections?.length) {
      updateStatus('No sensitive info found ✓');
      return { file, redacted: 0 };
    }

    console.log('Detox: Found', result.detections.length, 'sensitive items:', 
      result.detections.map(d => `${d.type}: "${d.text}" at (${d.bbox.x}, ${d.bbox.y})`));
    
    updateStatus(`Redacting ${result.detections.length} item(s)...`);

    // Apply redactions (scale bbox if image was resized on backend)
    const scale = result.scale || 1.0;
    console.log('Detox: Applying scale factor:', scale);
    const redactedCount = redactRegions(ctx, result.detections, scale);

    // Export as new file
    const blob = await new Promise(resolve => canvas.toBlob(resolve, file.type || 'image/jpeg', 0.95));
    const newFile = new File([blob], file.name, { type: file.type || 'image/jpeg' });

    console.log('Detox: Created redacted file:', newFile.name, newFile.size);
    
    updateStatus(`Done - ${redactedCount} item(s) redacted ✓`);
    return { file: newFile, redacted: redactedCount };
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        resolve(img);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  async function analyzeWithAPI(base64Image) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Timeout', detections: [] });
      }, CONFIG.timeout);
      
      chrome.runtime.sendMessage(
        { type: 'ANALYZE_IMAGE', image: base64Image },
        (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message, detections: [] });
          } else {
            resolve(response || { success: false, error: 'No response', detections: [] });
          }
        }
      );
    });
  }

  function redactRegions(ctx, detections, scale = 1.0) {
    const { padding, extraMargin, color } = CONFIG.blur;
    let count = 0;
    
    ctx.fillStyle = color;
    
    for (const detection of detections) {
      const { bbox } = detection;
      if (!bbox || typeof bbox.x !== 'number') {
        console.warn('Detox: Invalid bbox:', detection);
        continue;
      }
      
      // Scale coordinates back to original image size
      const scaledX = bbox.x * scale;
      const scaledY = bbox.y * scale;
      const scaledW = bbox.width * scale;
      const scaledH = bbox.height * scale;
      
      // Add extra margin (percentage of size) for better coverage
      const marginW = scaledW * extraMargin;
      const marginH = scaledH * extraMargin;
      
      // Calculate final box with padding and margin
      const x = Math.max(0, scaledX - padding - marginW);
      const y = Math.max(0, scaledY - padding - marginH);
      const w = scaledW + (padding * 2) + (marginW * 2);
      const h = scaledH + (padding * 2) + (marginH * 2);
      
      // Skip suspiciously large boxes
      if (w > ctx.canvas.width * 0.8 || h > ctx.canvas.height * 0.6) {
        console.warn('Detox: Skipping oversized box:', detection);
        continue;
      }
      
      console.log(`Detox: Drawing redaction at (${Math.round(x)}, ${Math.round(y)}) size ${Math.round(w)}x${Math.round(h)} for "${detection.text}"`);
      ctx.fillRect(x, y, w, h);
      count++;
    }
    
    return count;
  }

  // ===========================================
  // UI
  // ===========================================

  let overlay = null;
  let statusEl = null;

  function showOverlay() {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.innerHTML = `
        <div style="
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.85);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          color: white;
        ">
          <div style="
            width: 48px;
            height: 48px;
            border: 3px solid rgba(255,255,255,0.2);
            border-top-color: #00d4aa;
            border-radius: 50%;
            animation: detox-spin 1s linear infinite;
          "></div>
          <div id="detox-status" style="margin-top: 20px; font-size: 15px; font-weight: 500;">Processing...</div>
          <div style="margin-top: 8px; font-size: 12px; color: rgba(255,255,255,0.5);">Powered by Detox AI</div>
        </div>
        <style>
          @keyframes detox-spin { to { transform: rotate(360deg); } }
        </style>
      `;
      document.body.appendChild(overlay);
      statusEl = document.getElementById('detox-status');
    }
    overlay.style.display = 'block';
  }

  function hideOverlay() {
    if (overlay) overlay.style.display = 'none';
  }

  function updateStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function showNotification(message, type = 'info') {
    const colors = {
      info: 'linear-gradient(135deg, #00d4aa, #00a086)',
      success: 'linear-gradient(135deg, #00d4aa, #00a086)',
      error: 'linear-gradient(135deg, #ff6b6b, #ee5a5a)',
      warning: 'linear-gradient(135deg, #f59e0b, #d97706)'
    };
    
    const notif = document.createElement('div');
    notif.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: ${colors[type]};
      color: white;
      padding: 14px 24px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      font-weight: 500;
      z-index: 100000;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      opacity: 0;
      transition: all 0.3s ease;
    `;
    notif.textContent = message;
    document.body.appendChild(notif);
    
    requestAnimationFrame(() => {
      notif.style.opacity = '1';
      notif.style.transform = 'translateX(-50%) translateY(0)';
    });
    
    setTimeout(() => {
      notif.style.opacity = '0';
      notif.style.transform = 'translateX(-50%) translateY(20px)';
      setTimeout(() => notif.remove(), 300);
    }, 4000);
  }

  // ===========================================
  // Init
  // ===========================================

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'DETOX_TOGGLE') {
      isEnabled = message.enabled;
      console.log('Detox:', isEnabled ? 'Enabled' : 'Disabled');
    }
  });

  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (response) {
      isEnabled = response.enabled ?? true;
      if (!response.apiAvailable) {
        console.warn('Detox: API not available - start the backend server');
      } else {
        console.log('Detox: API connected');
      }
    }
  });

  initInterceptor();
  console.log('Detox: Content script ready');

})();
