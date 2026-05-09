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
      .ds-badge {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #00ff88;
        color: #004422;
        padding: 8px 16px;
        border-radius: 20px;
        font-family: sans-serif;
        font-weight: bold;
        font-size: 12px;
        box-shadow: 0 4px 15px rgba(0,255,136,0.3);
        z-index: 2147483647;
        animation: fadeInOut 4s forwards;
      }
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(20px); }
        10% { opacity: 1; transform: translateY(0); }
        80% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(20px); }
      }
    </style>
    <div class="ds-badge">🛡️ Shadow Shield Active</div>
  `;

  shadow.appendChild(wrapper);
  document.body.appendChild(container);

  // Auto-remove after animation
  setTimeout(() => container.remove(), 4000);
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
    window.open(chrome.runtime.getURL('report.html'), '_blank');
  };
}
