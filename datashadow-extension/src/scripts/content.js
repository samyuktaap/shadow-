// DataShadow Content Script - Handles the Red Alert Overlay

// Notify background that we are ready to receive data
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' });

// Track dismissed sites for this session
const dismissedSites = new Set();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DATA_SHADOW_ANALYSIS') {
    const { riskLevel, cookieCount, dangerousFields, trackerNames, domain, riskClassification } = message.data;

    // Don't show if already dismissed this session
    if (dismissedSites.has(domain)) return;

    // Check shield state — if ON, show "Protected" instead of Red Alert
    chrome.storage.local.get('shieldActive', (data) => {
      if (data.shieldActive) {
        showProtectedBadge();
      } else if (riskLevel === 'HIGH' || riskLevel === 'MEDIUM' || (riskClassification && riskClassification.risk_label !== 'Safe')) {
        showDynamicAlert(cookieCount, dangerousFields, trackerNames, domain, riskClassification);
      }
    });
  }
});

function scanForPrivacyPolicy() {
  const links = document.querySelectorAll('a');
  for (let link of links) {
    const text = link.innerText.toLowerCase();
    if (text.includes('privacy') || text.includes('policy')) {
      return link.href;
    }
  }
  return null;
}

function showProtectedBadge() {
  if (document.getElementById('datashadow-alert-container')) return;

  const container = document.createElement('div');
  container.id = 'datashadow-alert-container';
  
  const shadow = container.attachShadow({ mode: 'closed' });
  const wrapper = document.createElement('div');
  
  wrapper.innerHTML = `
    <style>
      .ds-shield-panel {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(10, 15, 25, 0.95);
        color: #e2e8f0;
        padding: 14px 18px;
        border-radius: 14px;
        font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        z-index: 2147483647;
        border: 1px solid rgba(0,255,136,0.25);
        backdrop-filter: blur(12px);
        animation: slideUp 0.4s ease-out;
        min-width: 240px;
      }
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(30px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .ds-shield-header {
        display: flex; align-items: center; gap: 8px;
        margin-bottom: 12px; font-weight: 700; font-size: 14px;
        color: #00ff88;
      }
      .ds-shield-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: #00ff88;
        box-shadow: 0 0 8px rgba(0,255,136,0.6);
        animation: pulse 2s ease-in-out infinite;
      }
      @keyframes pulse {
        0%,100% { opacity:1; transform:scale(1); }
        50% { opacity:0.5; transform:scale(1.3); }
      }
      .ds-shield-info {
        font-size: 11px; color: #94a3b8;
        margin-bottom: 12px; line-height: 1.5;
      }
      .ds-shield-btns {
        display: flex; gap: 8px;
      }
      .ds-shield-btns button {
        flex: 1;
        padding: 7px 10px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        font-weight: 700;
        font-size: 11px;
        transition: all 0.2s;
        font-family: inherit;
      }
      .ds-btn-report {
        background: #ff3333; color: #fff;
      }
      .ds-btn-report:hover { background: #ff4444; box-shadow: 0 0 12px rgba(255,51,51,0.3); }
      .ds-btn-dash {
        background: linear-gradient(135deg, #1a1a2e, #16213e);
        color: #38bdf8;
        border: 1px solid rgba(56,189,248,0.3) !important;
      }
      .ds-btn-dash:hover { border-color: rgba(56,189,248,0.6) !important; box-shadow: 0 0 12px rgba(56,189,248,0.2); }
      .ds-btn-pro {
        display: block; width: 100%; margin-top: 8px;
        padding: 7px 10px; border-radius: 8px; border: 1px solid rgba(167,139,250,0.3);
        background: linear-gradient(135deg, rgba(167,139,250,0.15), rgba(56,189,248,0.15));
        color: #a78bfa; font-weight: 700; font-size: 11px; cursor: pointer;
        transition: all 0.2s; font-family: inherit;
      }
      .ds-btn-pro:hover { box-shadow: 0 0 12px rgba(167,139,250,0.2); }
      .ds-dismiss {
        position: absolute; top: 8px; right: 10px;
        background: none; border: none;
        color: #475569; cursor: pointer;
        font-size: 16px; line-height: 1;
      }
      .ds-dismiss:hover { color: #94a3b8; }
    </style>
    <div class="ds-shield-panel">
      <button class="ds-dismiss" id="ds-close">×</button>
      <div class="ds-shield-header">
        <span class="ds-shield-dot"></span>
        🛡️ Shadow Shield Active
      </div>
      <div class="ds-shield-info">
        Blocking trackers from <strong>50 domains</strong>. Your browsing is protected.
      </div>
      <div class="ds-shield-btns">
        <button class="ds-btn-report" id="ds-report">Full Report →</button>
        <button class="ds-btn-dash" id="ds-dash">📊 Dashboard</button>
      </div>
      <button class="ds-btn-pro" id="ds-pro">⚡ Pro Features</button>
    </div>
  `;
  
  shadow.appendChild(wrapper);
  document.body.appendChild(container);

  shadow.getElementById('ds-close').onclick = () => container.remove();

  shadow.getElementById('ds-report').onclick = () => {
    const a = document.createElement('a');
    a.href = chrome.runtime.getURL('src/pages/report.html');
    a.target = '_blank'; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
  };

  shadow.getElementById('ds-dash').onclick = () => {
    const a = document.createElement('a');
    a.href = chrome.runtime.getURL('src/pages/dashboard.html');
    a.target = '_blank'; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
  };

  shadow.getElementById('ds-pro').onclick = () => {
    const a = document.createElement('a');
    a.href = chrome.runtime.getURL('src/pages/pro.html');
    a.target = '_blank'; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
  };

  // Auto-hide after 15 seconds
  setTimeout(() => container.remove(), 15000);
}

function showDynamicAlert(count, fields, names, domain, classification) {
  const policyUrl = scanForPrivacyPolicy();
  
  if (document.getElementById('datashadow-alert-container')) return;

  const container = document.createElement('div');
  container.id = 'datashadow-alert-container';
  
  const shadow = container.attachShadow({ mode: 'closed' });
  const wrapper = document.createElement('div');
  wrapper.className = 'ds-alert-wrapper';
  
  const alertText = fields.length > 0 ? fields.join(', ') : 'Minor tracking mechanisms';
  const trackerList = names && names.length > 0 
    ? `<div style="font-size: 10px; margin-top: 5px; opacity: 0.8;">Examples: ${names.join(', ')}</div>` 
    : '';
  const policyStatus = policyUrl 
    ? `<span style="color: #00ff88;">✅ Privacy Policy Detected</span>` 
    : `<span style="color: #ff9999;">⚠️ No Privacy Policy Found!</span>`;

  // Fallback defaults if classification is missing
  let title = "RED ALERT";
  let alertMsg = "Your privacy is being compromised in short.";
  let bgColor = "rgba(180, 0, 0, 0.95)";
  let icon = "⚠️";
  let threatHtml = "";

  if (classification) {
    title = classification.risk_label.toUpperCase();
    alertMsg = classification.alert_message;
    
    if (classification.visual_indicator === 'yellow') {
      bgColor = "rgba(200, 140, 0, 0.95)";
      icon = "👀";
    } else if (classification.visual_indicator === 'green') {
      bgColor = "rgba(0, 120, 50, 0.95)";
      icon = "✅";
    } else {
      bgColor = "rgba(180, 0, 0, 0.95)";
      icon = "🚨";
    }

    if (classification.threat_types.length > 0) {
      threatHtml = `<div style="margin-top: 6px; font-size: 11px; font-style: italic; color: #ffcccc;">Threats: ${classification.threat_types.join(', ')}</div>`;
    }
  }
  
  wrapper.innerHTML = `
    <style>
      .ds-alert-wrapper {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 320px;
        background: ${bgColor};
        color: white;
        padding: 16px;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        z-index: 2147483647;
        font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.2);
        animation: slideIn 0.5s ease-out;
      }
      @keyframes slideIn {
        from { transform: translateX(120%); }
        to { transform: translateX(0); }
      }
      .ds-header {
        font-weight: bold;
        font-size: 18px;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
      }
      .ds-warning-icon { margin-right: 8px; font-size: 20px; }
      .ds-body { font-size: 14px; line-height: 1.4; opacity: 0.9; }
      .ds-policy { margin-top: 8px; font-size: 12px; font-weight: bold; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px; }
      .ds-fields { 
        margin: 10px 0; 
        font-weight: bold; 
        color: #ffcccc;
        background: rgba(0,0,0,0.2);
        padding: 4px 8px;
        border-radius: 4px;
      }
      .ds-footer {
        margin-top: 15px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .ds-btn-nav {
        background: white;
        color: #333;
        border: none;
        padding: 6px 12px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
        font-size: 12px;
        transition: 0.2s;
      }
      .ds-btn-nav:hover { background: #eee; }
      .ds-close {
        cursor: pointer;
        font-size: 12px;
        text-decoration: underline;
        opacity: 0.7;
      }
    </style>
    <div class="ds-header">
      <span class="ds-warning-icon">${icon}</span> ${title}
    </div>
    <div class="ds-body">
      ${alertMsg}
      <br><br>
      Accessing <b>${count} shadow trackers</b>. 
      <div class="ds-fields">Data fields: ${alertText}</div>
      ${threatHtml}
      ${trackerList}
      <div class="ds-policy">${policyStatus}</div>
    </div>

    <div class="ds-shield-row">
      <span>🛡️ Shadow Shield</span>
      <button class="ds-shield-toggle" id="shield-toggle-btn">OFF</button>
    </div>

    <div class="ds-footer">
      <span class="ds-close" id="close-ds">Dismiss</span>
      <button class="ds-btn-block" id="block-ds">Block & Clean 🛡️</button>
      <button class="ds-btn-nav" id="nav-ds">Full Report →</button>
    </div>
    <button class="ds-btn-dashboard" id="dash-ds">📊 Value Dashboard</button>
    <button class="ds-btn-pro-alert" id="pro-ds">⚡ Pro Features</button>
  `;

  shadow.appendChild(wrapper);
  document.body.appendChild(container);

  // Style update for the new button
  const style = shadow.querySelector('style');
  style.textContent += `
    .ds-btn-block {
      background: #00ff88;
      color: #004422;
      border: none;
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
      font-size: 11px;
      transition: 0.2s;
    }
    .ds-btn-block:hover { background: #00cc6e; transform: scale(1.05); }
    .ds-btn-nav { font-size: 11px; padding: 6px 8px; }
    .ds-btn-dashboard {
      display: block;
      width: 100%;
      margin-top: 10px;
      padding: 8px 0;
      background: linear-gradient(135deg, #1a1a2e, #16213e);
      color: #38bdf8;
      border: 1px solid rgba(56,189,248,0.3);
      border-radius: 8px;
      cursor: pointer;
      font-weight: bold;
      font-size: 12px;
      transition: 0.2s;
      text-align: center;
    }
    .ds-btn-dashboard:hover {
      background: linear-gradient(135deg, #16213e, #0f3460);
      border-color: rgba(56,189,248,0.6);
      box-shadow: 0 0 12px rgba(56,189,248,0.2);
    }
    .ds-btn-pro-alert {
      display: block; width: 100%; margin-top: 8px; padding: 8px 0;
      background: linear-gradient(135deg, rgba(167,139,250,0.15), rgba(56,189,248,0.15));
      color: #a78bfa; border: 1px solid rgba(167,139,250,0.3); border-radius: 8px;
      cursor: pointer; font-weight: bold; font-size: 12px; transition: 0.2s; text-align: center;
    }
    .ds-btn-pro-alert:hover { box-shadow: 0 0 12px rgba(167,139,250,0.2); }
    .ds-shield-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 10px 0;
      padding: 8px 10px;
      background: rgba(0,0,0,0.25);
      border-radius: 8px;
      font-size: 13px;
      font-weight: bold;
    }
    .ds-shield-toggle {
      background: #555;
      color: #ccc;
      border: none;
      padding: 4px 14px;
      border-radius: 20px;
      cursor: pointer;
      font-weight: bold;
      font-size: 12px;
      transition: 0.3s;
    }
    .ds-shield-toggle.on {
      background: #00ff88;
      color: #004422;
      box-shadow: 0 0 8px rgba(0,255,136,0.6);
    }
  `;

  shadow.getElementById('close-ds').onclick = () => {
    if (domain) dismissedSites.add(domain);
    container.remove();
  };
  
  // Shadow Shield Toggle inside Red Alert
  const shieldToggle = shadow.getElementById('shield-toggle-btn');
  shieldToggle.onclick = () => {
    const isOn = shieldToggle.classList.toggle('on');
    shieldToggle.innerText = isOn ? 'ON ✅' : 'OFF';
    chrome.storage.local.set({ shieldActive: isOn });
    chrome.runtime.sendMessage({ type: isOn ? 'ENABLE_SHIELD' : 'DISABLE_SHIELD' });
    if (isOn) {
      setTimeout(() => {
        if (domain) dismissedSites.add(domain);
        container.remove();
        showProtectedBadge();
      }, 500);
    }
  };

  shadow.getElementById('block-ds').onclick = () => {
    chrome.runtime.sendMessage({ type: 'BLOCK_COOKIES', domain: window.location.hostname });
    if (domain) dismissedSites.add(domain);
    shadow.querySelector('.ds-btn-block').innerText = 'NUKED! ✅';
    shadow.querySelector('.ds-btn-block').style.background = '#888';
    shadow.querySelector('.ds-btn-block').disabled = true;
    setTimeout(() => container.remove(), 1500);
  };

  shadow.getElementById('nav-ds').onclick = () => {
    const reportUrl = chrome.runtime.getURL('src/pages/report.html');
    const a = document.createElement('a');
    a.href = reportUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Value Dashboard button
  shadow.getElementById('dash-ds').onclick = () => {
    const dashUrl = chrome.runtime.getURL('src/pages/dashboard.html');
    const a = document.createElement('a');
    a.href = dashUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Pro Features button
  shadow.getElementById('pro-ds').onclick = () => {
    const proUrl = chrome.runtime.getURL('src/pages/pro.html');
    const a = document.createElement('a');
    a.href = proUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
}
