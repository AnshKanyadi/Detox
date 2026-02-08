document.addEventListener('DOMContentLoaded', async () => {
  const enableToggle = document.getElementById('enableToggle');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const scannedCount = document.getElementById('scannedCount');
  const protectedCount = document.getElementById('protectedCount');
  const apiDot = document.getElementById('apiDot');
  const apiText = document.getElementById('apiText');
  const apiUrl = document.getElementById('apiUrl');
  const localModeBtn = document.getElementById('localMode');
  const hostedModeBtn = document.getElementById('hostedMode');
  const privacyLink = document.getElementById('privacyLink');

  let currentMode = 'local';

  loadStatus();

  enableToggle.addEventListener('change', async () => {
    const isEnabled = enableToggle.checked;
    await chrome.storage.local.set({ enabled: isEnabled });
    updateStatusUI(isEnabled);
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          type: 'DETOX_TOGGLE', 
          enabled: isEnabled 
        }).catch(() => {});
      }
    });
  });

  localModeBtn.addEventListener('click', () => setServerMode('local'));
  hostedModeBtn.addEventListener('click', () => setServerMode('hosted'));

  privacyLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.sendMessage({ type: 'GET_PRIVACY_POLICY' }, (policy) => {
      if (policy) {
        alert(
          `DETOX PRIVACY POLICY\n\n` +
          `Images: ${policy.data_collection.images}\n\n` +
          `OCR Results: ${policy.data_collection.ocr_results}\n\n` +
          `Data Retention: ${policy.data_retention}\n\n` +
          `Encryption: ${policy.encryption}`
        );
      } else {
        alert('Privacy policy not available. Using local mode keeps all data on your machine.');
      }
    });
  });

  function loadStatus() {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
      if (response) {
        enableToggle.checked = response.enabled ?? true;
        updateStatusUI(response.enabled ?? true);
        updateStatsUI(response.stats);
        currentMode = response.serverMode || 'local';
        updateModeUI(currentMode);
        updateApiUI(response.apiAvailable, response.serverUrl);
      }
    });
  }

  function setServerMode(mode) {
    chrome.runtime.sendMessage({ type: 'SET_SERVER_MODE', mode }, (response) => {
      if (response?.success) {
        currentMode = mode;
        updateModeUI(mode);
        chrome.runtime.sendMessage({ type: 'CHECK_API' }, (result) => {
          updateApiUI(result?.available, result?.url);
        });
      }
    });
  }

  function updateStatusUI(enabled) {
    if (enabled) {
      statusDot.classList.remove('off');
      statusText.textContent = 'Active';
    } else {
      statusDot.classList.add('off');
      statusText.textContent = 'Disabled';
    }
  }

  function updateStatsUI(stats) {
    if (stats) {
      scannedCount.textContent = stats.scanned || 0;
      protectedCount.textContent = stats.protected || 0;
    }
  }

  function updateModeUI(mode) {
    localModeBtn.classList.toggle('active', mode === 'local');
    hostedModeBtn.classList.toggle('active', mode === 'hosted');
  }

  function updateApiUI(available, url) {
    apiUrl.textContent = url || '';
    
    if (available) {
      apiDot.className = 'dot';
      apiText.textContent = 'Connected';
      apiText.className = 'api-text connected';
    } else {
      apiDot.className = 'dot error';
      if (currentMode === 'local') {
        apiText.textContent = 'Offline - Start local server 67676767';
      } else {
        apiText.textContent = 'Hosted API unavailable bruh';
      }
      apiText.className = 'api-text error :(';
    }
  }

  setInterval(loadStatus, 5000);
});
