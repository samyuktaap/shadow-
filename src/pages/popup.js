// DataShadow Popup Logic (Person 1)
// Auth — inline, no npm import needed
const SUPABASE_URL = 'https://hayotpzqanmjpacmbwvd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhheW90cHpxYW5tanBhY21id3ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDYyODAsImV4cCI6MjA5MzgyMjI4MH0.G4hLJ80XO_9oOIyZizP4-weLApSOlk4KgmywL1oWiDw';

async function loginWithGoogle() {
  // Use official Chrome Identity flow for better MFA (double verification) support
  const redirectUrl = chrome.identity.getRedirectURL();
  const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}`;

  chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, async (redirectedTo) => {
    if (chrome.runtime.lastError) {
      console.error('[Auth] Error:', chrome.runtime.lastError.message);
      alert('Login failed: ' + chrome.runtime.lastError.message);
      return;
    }
    if (!redirectedTo) return;

    try {
      const hashStr = redirectedTo.includes('#') ? redirectedTo.split('#')[1] : redirectedTo.split('?')[1];
      const params = new URLSearchParams(hashStr);
      const accessToken = params.get('access_token');

      if (accessToken) {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'apikey': SUPABASE_ANON_KEY }
        });
        const user = await res.json();
        await chrome.storage.local.set({ supabaseToken: accessToken, supabaseUser: user });
        
        // Refresh the popup to show logged in state
        window.location.reload();
      }
    } catch (err) {
      console.error('[Auth] Processing error:', err);
    }
  });
}

async function getCurrentUser() {
  const data = await chrome.storage.local.get(['supabaseUser', 'supabaseToken']);
  return (data.supabaseToken && data.supabaseUser) ? data.supabaseUser : null;
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
    try {
      const user = await getCurrentUser();
      const premiumButtons = [
        document.getElementById('analyze-btn'),
        document.getElementById('dashboard-btn'),
        document.getElementById('pro-btn')
      ];

      if (user) {
        userInfo.style.display = 'block';
        userEmail.innerText = user.email;
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'block';
        
        // Enable premium features
        premiumButtons.forEach(btn => {
          if (btn) {
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            btn.title = '';
          }
        });
      } else {
        userInfo.style.display = 'none';
        loginBtn.style.display = 'block';
        logoutBtn.style.display = 'none';

        // Disable premium features
        premiumButtons.forEach(btn => {
          if (btn) {
            btn.style.opacity = '0.5';
            btn.style.pointerEvents = 'none';
            btn.title = 'Please sign in to access this feature';
          }
        });
      }
    } catch (e) {
      console.error('[Auth] Error getting user:', e);
    }
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
  const marketEl = document.getElementById('market-value-popup');

  // Sync the popup with the EXACT current site data
  const { currentSiteStats, lastAnalysis } = await chrome.storage.local.get(['currentSiteStats', 'lastAnalysis']);
  
  const riskScore = currentSiteStats?.riskScore || lastAnalysis?.riskScore || 0;
  const marketVal = currentSiteStats?.marketValue || lastAnalysis?.marketValue || 0;

  if (scoreElement) {
    scoreElement.innerText = riskScore;
    if (riskScore > 70) scoreElement.style.color = '#ff3333';
    else if (riskScore > 30) scoreElement.style.color = '#ffaa00';
    else scoreElement.style.color = '#00ff88';
  }

  if (marketEl) {
    marketEl.innerText = `$${Number(marketVal).toFixed(2)}`;
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
    const trackers = parseFloat(lastAnalysis?.trackersFound) || 0;
    const cookies = parseFloat(lastAnalysis?.cookieCount) || 0;
    const val = trackers * 0.12 + cookies * 0.05;
    valueDisplay.innerText = `$${val.toFixed(2)}`;
  }
});
