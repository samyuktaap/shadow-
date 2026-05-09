// DataShadow Popup Logic
// 100% LOCAL ARCHITECTURE

async function getCurrentUser() {
  return null; // Always local mode
}

async function logout() {
  await chrome.storage.local.remove(['supabaseToken', 'supabaseRefreshToken', 'supabaseUser']);
}

document.addEventListener('DOMContentLoaded', async () => {
  // Auth State Management
  const userInfo = document.getElementById('user-info');
  const userEmail = document.getElementById('user-email');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');

  async function updateAuthUI() {
    // Local mode: Always show info as 'Local User' or hide auth section
    if (userInfo) userInfo.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';

    const premiumButtons = [
      document.getElementById('analyze-btn'),
      document.getElementById('dashboard-btn'),
      document.getElementById('pro-btn')
    ];

    // Always enable features in local mode
    premiumButtons.forEach(btn => {
      if (btn) {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.title = '';
      }
    });
  }

  // Initialize UI
  updateAuthUI();

  loginBtn.onclick = () => {
    // Just open Google login in a new tab.
    // background.js catches the token and opens dashboard AFTER login completes.
    loginWithGoogle();
    loginBtn.innerText = 'Check the new tab ↗';
    loginBtn.disabled = true;
  };

  logoutBtn.onclick = async () => {
    logoutBtn.innerText = 'Logging out...';
    try {
      await logout();
      await updateAuthUI();
      logoutBtn.innerText = 'Log out';
    } catch (e) {
      console.error('Logout failed:', e);
    }
  };

  const scoreElement = document.getElementById('score');

  // Sync the popup score with the EXACT background analysis
  const { lastAnalysis } = await chrome.storage.local.get('lastAnalysis');
  
  if (lastAnalysis) {
    let score = lastAnalysis.score !== undefined 
      ? lastAnalysis.score 
      : Math.min(lastAnalysis.cookieCount * 5, 100);
    
    scoreElement.innerText = score;
    
    if (score > 70) scoreElement.style.color = '#ff3333';
    else if (score > 30) scoreElement.style.color = '#ffaa00';
    else scoreElement.style.color = '#00ff88';
  } else {
    scoreElement.innerText = '--';
    scoreElement.style.color = '#555';
  }

  // Shadow Shield Toggle Logic
  const shieldBtn = document.getElementById('shield-toggle');
  
  const { shieldActive } = await chrome.storage.local.get('shieldActive');
  if (shieldActive) {
    shieldBtn.classList.add('active');
    shieldBtn.innerText = 'ON';
  }

  shieldBtn.onclick = async () => {
    const active = shieldBtn.classList.toggle('active');
    shieldBtn.innerText = active ? 'ON' : 'OFF';
    
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
        
        setTimeout(() => chrome.tabs.reload(tabs[0].id), 500);
      };
    } else {
      domainLabel.innerText = 'N/A';
      whitelistBtn.disabled = true;
      whitelistBtn.style.opacity = '0.5';
    }
  });

  // Analyze button
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

  // ☢️ PRIVACY NUKE Logic
  const nukeBtn = document.getElementById('nuke-btn');
  if (nukeBtn) {
    nukeBtn.onclick = async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0] && tabs[0].url) {
        nukeBtn.innerText = "☣️ DETONATING...";
        nukeBtn.style.background = "#ff0000";
        
        chrome.runtime.sendMessage({ 
          type: 'DETONATE_NUKE', 
          url: tabs[0].url 
        }, (response) => {
          if (response && response.success) {
            setTimeout(() => {
              nukeBtn.innerText = "✅ NUKE COMPLETE";
              chrome.tabs.reload(tabs[0].id);
            }, 800);
            setTimeout(() => {
              nukeBtn.innerText = "☢️ Detonate Privacy Nuke";
              nukeBtn.style.background = "";
            }, 3000);
          }
        });
      }
    };
  }

  // Sync Market Value display
  const valueDisplay = document.getElementById('market-value-popup');
  if (valueDisplay) {
    if (lastAnalysis && lastAnalysis.marketValue !== undefined) {
      valueDisplay.innerText = `$${lastAnalysis.marketValue}`;
    } else {
      // Fallback calculation for popup
      const val = (lastAnalysis ? (lastAnalysis.trackersFound * 0.12 + lastAnalysis.cookieCount * 0.05) : 0);
      valueDisplay.innerText = `$${val.toFixed(2)}`;
    }
  }
});
