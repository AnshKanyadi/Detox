(function() {
  'use strict';

  const CONFIG = {
    blur: {
      padding: 15,
      extraMargin: 0.15,
      color: '#000'
    },
    timeout: 180000
  };

  let isEnabled = true;
  let isProcessing = false;
  let isHandingOff = false;

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

    let originalFiles = null;

    input.addEventListener('change', function(event) {
      if (isHandingOff) return;
      if (!isEnabled) return;

      if (isProcessing) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      const files = event.target.files;
      if (!files?.length) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      originalFiles = Array.from(files);
      const dt = new DataTransfer();
      input.files = dt.files;

      console.log('Detox: Intercepted', originalFiles.length, 'file(s), starting processing...');

      isProcessing = true;
      showOverlay();

      processFiles(input, originalFiles);
    }, true);
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

      console.log('Detox: Handing off', processedFiles.length, 'processed file(s)');
      isHandingOff = true;

      const dt = new DataTransfer();
      processedFiles.forEach(f => dt.items.add(f));
      input.files = dt.files;

      await new Promise(r => setTimeout(r, 50));

      const changeEvent = new Event('change', { bubbles: true, cancelable: true });
      input.dispatchEvent(changeEvent);

      setTimeout(() => { isHandingOff = false; }, 200);
    } catch (error) {
      console.error('Detox: Processing error', error);
      showNotification('Processing failed: ' + error.message, 'error');

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

  async function processImage(file) {
    updateStatus('Preparing image...');
    const base64 = await fileToBase64(file);

    const img = await loadImage(file);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    updateStatus('Analyzing...');
    const result = await analyzeWithAPI(base64);

    console.log('Detox: Full API response:', JSON.stringify(result, null, 2));

    if (!result.success) {
      updateStatus('API unavailable');
      return { file, redacted: 0 };
    }

    if (!result.detections?.length) {
      updateStatus('No sensitive info found');
      return { file, redacted: 0 };
    }

    console.log('Detox: Found', result.detections.length, 'sensitive items');
    updateStatus(`Redacting ${result.detections.length} item(s)...`);

    const scale = result.scale || 1.0;
    const redactedCount = redactRegions(ctx, result.detections, scale);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, file.type || 'image/jpeg', 0.95));
    const newFile = new File([blob], file.name, { type: file.type || 'image/jpeg' });

    console.log('Detox: Created redacted file:', newFile.name, newFile.size);

    updateStatus(`Done - ${redactedCount} item(s) redacted`);
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
      if (!bbox || typeof bbox.x !== 'number') continue;

      const scaledX = bbox.x * scale;
      const scaledY = bbox.y * scale;
      const scaledW = bbox.width * scale;
      const scaledH = bbox.height * scale;

      const marginW = scaledW * extraMargin;
      const marginH = scaledH * extraMargin;

      const x = Math.max(0, scaledX - padding - marginW);
      const y = Math.max(0, scaledY - padding - marginH);
      const w = scaledW + (padding * 2) + (marginW * 2);
      const h = scaledH + (padding * 2) + (marginH * 2);

      if (w > ctx.canvas.width * 0.8 || h > ctx.canvas.height * 0.6) continue;

      ctx.fillRect(x, y, w, h);
      count++;
    }

    return count;
  }

  let overlay = null;
  let statusEl = null;

  function showOverlay() {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.innerHTML = `
        <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.92); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 99999; font-family: 'SF Pro Display', -apple-system, sans-serif; color: white; gap: 16px;">
          <div style="width: 44px; height: 44px; border: 3px solid rgba(255,255,255,0.18); border-top-color: #fff; border-radius: 50%; animation: detox-spin 1s linear infinite;"></div>
          <div id="detox-status" style="font-size: 15px; font-weight: 600; letter-spacing: 0.3px;">Processing...</div>
        </div>
        <style>@keyframes detox-spin { to { transform: rotate(360deg); } }</style>
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
      info: '#121212',
      success: '#121212',
      error: '#1e1e1e'
    };

    const border = {
      info: '1px solid rgba(255,255,255,0.12)',
      success: '1px solid rgba(255,255,255,0.16)',
      error: '1px solid rgba(255,255,255,0.22)'
    };

    const notif = document.createElement('div');
    notif.style.cssText = `position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(20px); background: ${colors[type]}; color: #f5f5f5; padding: 12px 18px; border-radius: 10px; font-family: 'SF Pro Display', -apple-system, sans-serif; font-size: 13px; font-weight: 600; letter-spacing: 0.2px; z-index: 100000; box-shadow: 0 12px 40px rgba(0,0,0,0.35); opacity: 0; transition: all 0.25s ease; backdrop-filter: blur(6px); ${border[type]};`;
    notif.textContent = message;
    document.body.appendChild(notif);

    requestAnimationFrame(() => {
      notif.style.opacity = '1';
      notif.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
      notif.style.opacity = '0';
      notif.style.transform = 'translateX(-50%) translateY(20px)';
      setTimeout(() => notif.remove(), 250);
    }, 3200);
  }

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
