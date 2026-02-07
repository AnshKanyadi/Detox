/**
 * Detox Background Service Worker
 * Supports both local and hosted API modes
 */

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
  // Server options
  servers: {
    local: 'http://localhost:8000',
    hosted: 'https://detoxbackend-production.up.railway.app'
  },
  defaultMode: 'local',  // 'local' or 'hosted'
  timeout: 120000
};

let currentMode = CONFIG.defaultMode;
let currentApiUrl = CONFIG.servers[currentMode];

// =============================================================================
// API Communication
// =============================================================================

async function analyzeImage(base64Image) {
  const startTime = Date.now();
  
  try {
    console.log(`Detox: Sending to ${currentMode} server...`);
    
    const response = await fetch(`${currentApiUrl}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image: base64Image })
    });

    if (response.status === 429) {
      return { 
        success: false, 
        error: 'Rate limit exceeded. Please wait a moment.',
        detections: [] 
      };
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status}`);
    }

    const result = await response.json();
    console.log(`Detox: Processed in ${Date.now() - startTime}ms`);
    
    return result;
    
  } catch (error) {
    console.error('Detox: API error:', error.message);
    
    // If hosted fails, suggest local
    if (currentMode === 'hosted') {
      return { 
        success: false, 
        error: 'Hosted API unavailable. Try switching to local mode.',
        detections: [] 
      };
    }
    
    return { 
      success: false, 
      error: error.message,
      detections: [] 
    };
  }
}

async function checkApiHealth() {
  try {
    const response = await fetch(`${currentApiUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function getPrivacyPolicy() {
  try {
    const response = await fetch(`${currentApiUrl}/privacy`);
    if (response.ok) {
      return await response.json();
    }
  } catch {}
  return null;
}

// =============================================================================
// Message Handling
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYZE_IMAGE') {
    analyzeImage(message.image).then(sendResponse);
    return true;
  }

  if (message.type === 'CHECK_API') {
    checkApiHealth().then(healthy => {
      sendResponse({ available: healthy, mode: currentMode, url: currentApiUrl });
    });
    return true;
  }

  if (message.type === 'DETOX_SCAN_COMPLETE') {
    updateStats(message.foundSensitive);
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === 'GET_STATUS') {
    Promise.all([
      chrome.storage.local.get(['enabled', 'stats', 'serverMode']),
      checkApiHealth()
    ]).then(([storage, apiAvailable]) => {
      sendResponse({ 
        enabled: storage.enabled ?? true,
        stats: storage.stats,
        apiAvailable,
        serverMode: currentMode,
        serverUrl: currentApiUrl
      });
    });
    return true;
  }
  
  if (message.type === 'SET_SERVER_MODE') {
    const mode = message.mode;
    if (CONFIG.servers[mode]) {
      currentMode = mode;
      currentApiUrl = CONFIG.servers[mode];
      chrome.storage.local.set({ serverMode: mode });
      console.log(`Detox: Switched to ${mode} mode: ${currentApiUrl}`);
      sendResponse({ success: true, mode, url: currentApiUrl });
    } else {
      sendResponse({ success: false, error: 'Invalid mode' });
    }
    return true;
  }

  if (message.type === 'SET_CUSTOM_SERVER') {
    currentApiUrl = message.url;
    currentMode = 'custom';
    chrome.storage.local.set({ serverMode: 'custom', customServerUrl: message.url });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'GET_PRIVACY_POLICY') {
    getPrivacyPolicy().then(sendResponse);
    return true;
  }

  return false;
});

// =============================================================================
// Statistics
// =============================================================================

async function updateStats(foundSensitive) {
  const { stats = { scanned: 0, protected: 0 } } = 
    await chrome.storage.local.get(['stats']);
  
  stats.scanned += 1;
  if (foundSensitive) stats.protected += 1;
  
  await chrome.storage.local.set({ stats });
}

// =============================================================================
// Lifecycle
// =============================================================================

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      enabled: true,
      serverMode: CONFIG.defaultMode,
      stats: { scanned: 0, protected: 0 }
    });
    console.log('Detox: Installed');
  }
});

// Load saved server mode
chrome.storage.local.get(['serverMode', 'customServerUrl']).then(({ serverMode, customServerUrl }) => {
  if (serverMode && CONFIG.servers[serverMode]) {
    currentMode = serverMode;
    currentApiUrl = CONFIG.servers[serverMode];
  } else if (serverMode === 'custom' && customServerUrl) {
    currentMode = 'custom';
    currentApiUrl = customServerUrl;
  }
  console.log(`Detox: Using ${currentMode} server: ${currentApiUrl}`);
});

console.log('Detox: Background ready');
