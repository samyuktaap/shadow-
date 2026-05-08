// DataShadow Popup Logic (Person 1)

document.addEventListener('DOMContentLoaded', async () => {
  const scoreElement = document.getElementById('score');

  // Sync the popup score with the EXACT background analysis
  const { lastAnalysis } = await chrome.storage.local.get('lastAnalysis');
  
  if (lastAnalysis) {
    // Fallback calculation just in case the stored data is from an older version
    let score = lastAnalysis.score !== undefined 
      ? lastAnalysis.score 
      : Math.min(lastAnalysis.cookieCount * 5, 100);
    
    scoreElement.innerText = score;
    
    // Color coding based on risk
    if (score > 70) scoreElement.style.color = '#ff3333'; // High
    else if (score > 30) scoreElement.style.color = '#ffaa00'; // Medium
    else scoreElement.style.color = '#00ff88'; // Low
  } else {
    scoreElement.innerText = '--';
    scoreElement.style.color = '#555';
  }

  // Shadow Shield Toggle Logic
  const shieldBtn = document.getElementById('shield-toggle');
  
  // Check current state from storage
  const { shieldActive } = await chrome.storage.local.get('shieldActive');
  if (shieldActive) {
    shieldBtn.classList.add('active');
    shieldBtn.innerText = 'ON';
  }

  shieldBtn.onclick = async () => {
    const active = shieldBtn.classList.toggle('active');
    shieldBtn.innerText = active ? 'ON' : 'OFF';
    
    // Save state and notify background
    await chrome.storage.local.set({ shieldActive: active });
    if (active) {
      chrome.runtime.sendMessage({ type: 'ENABLE_SHIELD' });
    } else {
      chrome.runtime.sendMessage({ type: 'DISABLE_SHIELD' });
    }
  };

  // Whitelist Logic
  const whitelistBtn = document.getElementById('whitelist-toggle');
  const domainLabel = document.getElementById('current-domain');
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url && tabs[0].url.startsWith('http')) {
      const domain = new URL(tabs[0].url).hostname;
      domainLabel.innerText = domain;
      
      chrome.runtime.sendMessage({ type: 'CHECK_WHITELIST', domain }, (response) => {
        if (response && response.isWhitelisted) {
          whitelistBtn.classList.add('active');
          whitelistBtn.innerText = 'ON';
          whitelistBtn.style.background = '#f59e0b';
          whitelistBtn.style.color = '#fff';
          whitelistBtn.style.boxShadow = '0 0 10px rgba(245,158,11,0.4)';
        }
      });

      whitelistBtn.onclick = () => {
        const isActive = whitelistBtn.classList.toggle('active');
        if (isActive) {
          whitelistBtn.innerText = 'ON';
          whitelistBtn.style.background = '#f59e0b';
          whitelistBtn.style.color = '#fff';
          whitelistBtn.style.boxShadow = '0 0 10px rgba(245,158,11,0.4)';
          chrome.runtime.sendMessage({ type: 'ADD_WHITELIST', domain });
        } else {
          whitelistBtn.innerText = 'OFF';
          whitelistBtn.style.background = '#444';
          whitelistBtn.style.color = '#aaa';
          whitelistBtn.style.boxShadow = 'none';
          chrome.runtime.sendMessage({ type: 'REMOVE_WHITELIST', domain });
        }
        
        // Reload page to apply changes
        setTimeout(() => chrome.tabs.reload(tabs[0].id), 500);
      };
    } else {
      domainLabel.innerText = 'N/A';
      whitelistBtn.disabled = true;
      whitelistBtn.style.opacity = '0.5';
    }
  });

  // Analyze button inside DOMContentLoaded (fix!)
  document.getElementById('analyze-btn').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/report.html') });
  };

  // Value Dashboard button
  document.getElementById('dashboard-btn').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/dashboard.html') });
  };

  // Pro Features button
  document.getElementById('pro-btn').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/pro.html') });
  };
});
