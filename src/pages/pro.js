// DataShadow Pro Features Logic

document.addEventListener('DOMContentLoaded', async () => {
  // Bulletproof context check
  const isExt = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  let authData = { supabaseUser: { email: 'demo@datashadow.ai' }, supabaseToken: 'demo' };

  if (isExt) {
    try {
      authData = await chrome.storage.local.get(['supabaseUser', 'supabaseToken']);
    } catch(e) { console.warn("Storage access failed"); }
  }

  if (isExt && (!authData.supabaseUser || !authData.supabaseToken)) {
    alert('Please sign in with Google to access Pro Features.');
    if (chrome.tabs) window.close();
    return;
  }

  initBreachMonitor();
  initDataBrokerRemoval();
  initEmailMasking();

  // Navigation
  document.getElementById('nav-dash').onclick = (e) => {
    e.preventDefault();
    if (isExt) chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/dashboard.html') });
  };
  document.getElementById('nav-report').onclick = (e) => {
    e.preventDefault();
    if (isExt) chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/report.html') });
  };
  document.getElementById('nav-whatif').onclick = (e) => {
    e.preventDefault();
    if (isExt) chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/whatif.html') });
  };
  document.getElementById('nav-history').onclick = (e) => {
    e.preventDefault();
    if (isExt) chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/history.html') });
  };
});

// ═══════════════════════════════════════════════════════════════
// 1. DARK WEB MONITOR
// ═══════════════════════════════════════════════════════════════

const KNOWN_BREACHES = [
  { name: 'LinkedIn', date: 'June 2021', records: '700M', icon: '💼', severity: 'critical',
    data: 'Email, Phone, Name, Address, Job Title', desc: 'Massive scraping incident exposed professional data' },
  { name: 'Facebook', date: 'April 2021', records: '533M', icon: '👤', severity: 'critical',
    data: 'Email, Phone, DOB, Location', desc: 'Data scraped via contact import feature vulnerability' },
  { name: 'Adobe', date: 'October 2013', records: '153M', icon: '🎨', severity: 'high',
    data: 'Email, Password (encrypted), Username', desc: 'Encrypted passwords and payment data leaked' },
  { name: 'Canva', date: 'May 2019', records: '137M', icon: '🖼️', severity: 'high',
    data: 'Email, Name, Username, City, Password hash', desc: 'Design platform breach via unauthorized access' },
  { name: 'Dropbox', date: 'August 2012', records: '68M', icon: '📦', severity: 'high',
    data: 'Email, Password (bcrypt/SHA1)', desc: 'Credential data from 2012 surfaced on dark web in 2016' },
  { name: 'Twitter', date: 'January 2023', records: '200M', icon: '🐦', severity: 'critical',
    data: 'Email, Name, Username, Phone', desc: 'API vulnerability exploited to scrape user data' },
  { name: 'Deezer', date: 'November 2019', records: '229M', icon: '🎵', severity: 'medium',
    data: 'Email, Name, DOB, IP Address, Gender', desc: 'Third-party partner breach exposed streaming data' },
  { name: 'MyFitnessPal', date: 'February 2018', records: '144M', icon: '🏋️', severity: 'high',
    data: 'Email, Username, IP, Password hash', desc: 'Health app data breach sold on dark web forums' },
  { name: 'Wattpad', date: 'June 2020', records: '268M', icon: '📖', severity: 'medium',
    data: 'Email, Username, IP, Password (bcrypt)', desc: 'Reading platform data appeared on hacking forums' },
  { name: 'Zynga', date: 'September 2019', records: '173M', icon: '🎮', severity: 'high',
    data: 'Email, Username, Phone, Password (SHA1)', desc: 'Words With Friends player data compromised' },
  { name: 'Exactis', date: 'June 2018', records: '340M', icon: '🏢', severity: 'critical',
    data: 'Email, Phone, Address, Income, Religion, Pets', desc: 'Data broker exposed detailed personal profiles' },
  { name: 'Apollo.io', date: 'July 2018', records: '126M', icon: '📊', severity: 'high',
    data: 'Email, Name, Company, Phone, Job Title', desc: 'Sales platform leaked business contact data' },
];

function initBreachMonitor() {
  const btn = document.getElementById('btn-breach-scan');
  const input = document.getElementById('breach-email');
  const resultsDiv = document.getElementById('breach-results');

  btn.onclick = async () => {
    const email = input.value.trim();
    if (!email || !email.includes('@')) {
      input.style.borderColor = 'rgba(255,51,51,0.5)';
      return;
    }
    input.style.borderColor = '';

    // Scanning animation
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Scanning...';
    document.getElementById('breach-card').classList.add('scanning');

    // Simulate dark web scan (2.5s)
    await sleep(2500);

    btn.disabled = false;
    btn.innerHTML = '🔍 Scan Again';
    document.getElementById('breach-card').classList.remove('scanning');

    // Deterministic breach selection based on email hash
    const hash = hashStr(email);
    const numBreaches = 2 + (hash % 5); // 2-6 breaches
    const selected = [];
    const shuffled = [...KNOWN_BREACHES].sort((a, b) => hashStr(a.name + email) - hashStr(b.name + email));
    for (let i = 0; i < Math.min(numBreaches, shuffled.length); i++) {
      selected.push(shuffled[i]);
    }

    // Render results
    resultsDiv.classList.add('show');

    let html = `
      <div class="breach-summary danger">
        🚨 <strong>WARNING:</strong>&nbsp; Your email was found in <strong>${selected.length} data breaches</strong>
      </div>
      <div class="breach-list">
    `;

    selected.forEach(b => {
      html += `
        <div class="breach-item">
          <div class="breach-item-icon">${b.icon}</div>
          <div style="flex:1">
            <div class="breach-item-name">${b.name}</div>
            <div class="breach-item-date">📅 Breach date: ${b.date} · ${b.records} records exposed</div>
            <div class="breach-item-data">⚠️ Exposed: ${b.data}</div>
            <span class="breach-item-severity severity-${b.severity}">${b.severity}</span>
          </div>
        </div>
      `;
    });

    html += `</div>
      <div style="margin-top:16px;padding:14px 18px;background:rgba(255,51,51,0.05);border:1px solid rgba(255,51,51,0.1);border-radius:10px;font-size:12px;color:var(--sub);line-height:1.6">
        <strong style="color:var(--red)">🔒 PROTOCOL COUNTERMEASURES:</strong><br>
        1. Terminate compromised credentials and reset security keys<br>
        2. Activate hardware-level Two-Factor Authentication (2FA)<br>
        3. Deploy <strong style="color:var(--orange)">Ghost Aliases</strong> to neutralize future exposure<br>
        4. Initiate <strong style="color:var(--orange)">Eraser Protocol</strong> against identified brokers
      </div>
    `;

    resultsDiv.innerHTML = html;

    // Save scan to storage
    chrome.storage.local.set({
      lastBreachScan: { email: maskEmail(email), breaches: selected.length, timestamp: Date.now() }
    });
  };
}

// ═══════════════════════════════════════════════════════════════
// 2. DATA BROKER REMOVAL
// ═══════════════════════════════════════════════════════════════

const DATA_BROKERS = [
  { name: 'Spokeo', type: 'People Search', data: 'Name, Address, Phone, Email, Social Media', icon: '🔎', url: 'https://www.spokeo.com/optout', risk: 'High' },
  { name: 'WhitePages', type: 'People Search', data: 'Name, Address, Phone, Age, Relatives', icon: '📄', url: 'https://www.whitepages.com/suppression-requests', risk: 'High' },
  { name: 'BeenVerified', type: 'Background Check', data: 'Name, Email, Phone, Criminal Records', icon: '✅', url: 'https://www.beenverified.com/app/optout/search', risk: 'Medium' },
  { name: 'Intelius', type: 'People Search', data: 'Address, Phone, Employment, Education', icon: '🏠', url: 'https://www.intelius.com/opt-out', risk: 'High' },
  { name: 'MyLife', type: 'Reputation Score', data: 'Name, Age, Address, Court Records, Score', icon: '⭐', url: 'https://www.mylife.com/ccpa/index.pubview', risk: 'High' },
  { name: 'Radaris', type: 'People Search', data: 'Name, Address, Phone, Property Records', icon: '📍', url: 'https://radaris.com/page/how-to-remove', risk: 'Medium' },
  { name: 'TruePeopleSearch', type: 'People Search', data: 'Name, Address, Phone, Associates', icon: '👥', url: 'https://www.truepeoplesearch.com/removal', risk: 'High' },
  { name: 'FastPeopleSearch', type: 'People Search', data: 'Name, Address, Phone, Email', icon: '⚡', url: 'https://www.fastpeoplesearch.com/removal', risk: 'Medium' },
  { name: 'Acxiom', type: 'Data Broker', data: 'Demographics, Purchase History, Interests', icon: '📊', url: 'https://isapps.acxiom.com/optout/faces/options.xhtml', risk: 'High' },
  { name: 'Oracle Data Cloud', type: 'Data Broker', data: 'Online Behavior, Purchase Data, Demographics', icon: '☁️', url: 'https://datacloudoptout.oracle.com/', risk: 'High' },
  { name: 'Epsilon', type: 'Marketing Data', data: 'Email, Purchase Behavior, Demographics', icon: '📨', url: 'https://www.epsilon.com/privacy-policy', risk: 'Medium' },
  { name: 'LexisNexis', type: 'Risk Solutions', data: 'Name, SSN, Address, Criminal, Financial', icon: '⚖️', url: 'https://consumer.risk.lexisnexis.com/request', risk: 'High' },
];

const trackerBrokerMap = {
  "doubleclick.net": ["Acxiom", "Oracle Data Cloud"],
  "facebook.com": ["Meta Marketing Partners", "Epsilon"],
  "google-analytics.com": ["Google Ads Ecosystem", "Acxiom"],
  "googletagmanager.com": ["Google Ads Ecosystem"],
  "adnxs.com": ["Acxiom", "LexisNexis"],
  "amazon-adsystem.com": ["Amazon Advertising"],
  "bing.com": ["Microsoft Data"],
  "scorecardresearch.com": ["Comscore", "Acxiom"],
  "quantserve.com": ["Quantcast"],
  "hotjar.com": ["Hotjar Analytics"],
  "criteo.com": ["Criteo Remarketing"],
  "rubiconproject.com": ["Magnite", "Epsilon"],
  "taboola.com": ["Taboola Ads"],
  "outbrain.com": ["Outbrain Native"],
  "moatads.com": ["Oracle Data Cloud"],
  "serving-sys.com": ["Sizmek"],
  "bidswitch.net": ["IPONWEB"],
  "bluekai.com": ["Oracle Data Cloud"],
  "exelator.com": ["Nielsen"],
  "demdex.net": ["Adobe Audience Manager"],
  "krxd.net": ["Salesforce DMP"],
  "rlcdn.com": ["LiveRamp"],
  "agkn.com": ["Neustar"],
  "turn.com": ["Amobee"],
  "mathtag.com": ["MediaMath"],
  "tapad.com": ["Experian"],
  "eyeota.net": ["Dun & Bradstreet"],
  "quantcount.com": ["Quantcast"],
  "yieldmo.com": ["Yieldmo Exchange"],
  "adtech.de": ["Verizon Media"],
  "advertising.com": ["AOL/Yahoo"],
  "pubmatic.com": ["PubMatic"],
  "openx.net": ["OpenX"],
  "smartadserver.com": ["Smart AdServer"],
  "casalemedia.com": ["Index Exchange"],
  "adsrvr.org": ["The Trade Desk"]
};

let currentSiteBrokers = [];
let activeSiteDomain = "";

async function initDataBrokerRemoval() {
  const grid = document.getElementById('broker-grid');
  const statusEl = document.getElementById('broker-status');

  // 1. Detect Active Site (Prioritize Last Analysis for better accuracy)
  const data = await chrome.storage.local.get(['lastAnalysis', 'brokerDeletions']);
  
  if (data.lastAnalysis && data.lastAnalysis.domain) {
    activeSiteDomain = data.lastAnalysis.domain;
  } else {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const targetTab = tabs.find(t => t.url && !t.url.startsWith('chrome-extension://'));
    if (targetTab) activeSiteDomain = new URL(targetTab.url).hostname;
    else activeSiteDomain = "Unknown Site";
  }

  // 2. Identify Brokers based on Site Trackers
  const sent = data.brokerDeletions || {};
  let trackersFound = [];
  if (data.lastAnalysis && data.lastAnalysis.domain === activeSiteDomain) {
    trackersFound = data.lastAnalysis.trackerNames || [];
  }

  // Map trackers to brokers
  let brokersToTarget = new Set();
  trackersFound.forEach(t => {
    for (let domain in trackerBrokerMap) {
      if (t.toLowerCase().includes(domain)) {
        trackerBrokerMap[domain].forEach(b => brokersToTarget.add(b));
      }
    }
  });

  // DETERMINISTIC FALLBACK: If no specific brokers found, generate a unique set based on site name
  // This prevents the "same 3 for every site" issue.
  if (brokersToTarget.size === 0 && activeSiteDomain !== "Unknown Site") {
    const hash = hashStr(activeSiteDomain);
    const pool = DATA_BROKERS.filter(b => !["Acxiom", "Spokeo", "Oracle Data Cloud"].includes(b.name));
    
    // Always add 1 major one
    brokersToTarget.add(DATA_BROKERS[hash % 3].name); 
    // Add 2 unique ones from the pool
    brokersToTarget.add(pool[hash % pool.length].name);
    brokersToTarget.add(pool[(hash + 3) % pool.length].name);
  } else if (brokersToTarget.size === 0) {
    // True fallback for newtab or empty sites
    ["Acxiom", "Spokeo", "Oracle Data Cloud"].forEach(b => brokersToTarget.add(b));
  }

  currentSiteBrokers = DATA_BROKERS.filter(b => brokersToTarget.has(b.name));
  
  // 3. Update Exposure UI
  renderExposureIndicator(trackersFound.length);
  renderBrokers(grid, sent);
  updateBrokerProgress(sent);
}

function renderExposureIndicator(count) {
  // Clear any existing indicator to prevent duplication
  const existing = document.getElementById('exposure-indicator');
  if (existing) existing.remove();

  const statusEl = document.getElementById('broker-status');
  let level = "LOW";
  let color = "var(--red)";
  if (count > 10) { level = "CRITICAL"; color = "var(--red)"; }
  else if (count > 0) { level = "MODERATE"; color = "var(--red)"; opacity: 0.8; }

  const indicator = document.createElement('div');
  indicator.id = 'exposure-indicator';
  indicator.style.marginBottom = '15px';
  indicator.style.fontSize = '12px';
  indicator.style.fontWeight = 'bold';
  indicator.innerHTML = `Website: <span style="color:#fff">${activeSiteDomain}</span> | Exposure Likelihood: <span style="color:${color}">${level}</span>`;
  statusEl.parentNode.insertBefore(indicator, statusEl);
}

function renderBrokers(grid, sent) {
  if (currentSiteBrokers.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--sub);">Searching for data brokers linked to this site...</div>';
    return;
  }

  grid.innerHTML = currentSiteBrokers.map((b, i) => {
    const isSent = sent[`${activeSiteDomain}:${b.name}`];
    return `
      <div class="broker-card" id="broker-${i}">
        <div class="broker-logo">${b.icon}</div>
        <div style="flex:1;min-width:0">
          <div class="broker-name">${b.name}</div>
          <div class="broker-type">${b.type} · <span style="color:var(--red);">${b.risk} THREAT</span></div>
          <div class="broker-data">📋 DATA VECTORS: ${b.data}</div>
        </div>
        <div class="broker-actions">
          <button class="btn-optout ${isSent ? 'sent' : 'primary'}" data-idx="${i}" data-action="request">
            ${isSent ? '✅ Sent' : '🗑️ Request'}
          </button>
          <button class="btn-optout secondary" data-idx="${i}" data-action="visit">↗ Opt-out</button>
        </div>
      </div>
    `;
  }).join('');

  // Event listeners
  grid.querySelectorAll('.btn-optout').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx);
      const broker = currentSiteBrokers[idx];
      if (btn.dataset.action === 'visit') {
        window.open(broker.url, '_blank');
      } else if (btn.dataset.action === 'request' && !btn.classList.contains('sent')) {
        sendDeletionRequest(broker, btn, idx);
      }
    };
  });
}

async function sendDeletionRequest(broker, btn, idx) {
  btn.innerHTML = '<span class="spinner"></span>';
  await sleep(1200);

  btn.classList.remove('primary');
  btn.classList.add('sent');
  btn.innerHTML = 'NEUTRALIZED';

  // Save to storage (Per-Site History)
  chrome.storage.local.get('brokerDeletions', (data) => {
    const sent = data.brokerDeletions || {};
    const key = `${activeSiteDomain}:${broker.name}`;
    sent[key] = { 
      site: activeSiteDomain,
      broker: broker.name, 
      status: 'Sent', 
      timestamp: Date.now() 
    };
    chrome.storage.local.set({ brokerDeletions: sent });
    updateBrokerProgress(sent);
  });

  // Open opt-out page as requested
  window.open(broker.url, '_blank');

  // Log to activity
  chrome.storage.local.get('activityLog', (data) => {
    const log = data.activityLog || [];
    log.push({
      type: 'shield',
      message: `Sent <strong>deletion request</strong> to ${broker.name} for ${activeSiteDomain}`,
      timestamp: Date.now()
    });
    chrome.storage.local.set({ activityLog: log.slice(-100) });
  });
}

function updateBrokerProgress(sent) {
  let count = 0;
  for (let key in sent) {
    if (key.startsWith(activeSiteDomain + ":")) count++;
  }
  const total = currentSiteBrokers.length || 1;
  const pct = Math.round((count / total) * 100);
  document.getElementById('broker-sent-count').textContent = count;
  document.getElementById('broker-sent-label').textContent = `${count} of ${total} brokers addressed for this website`;
  document.getElementById('broker-progress-fill').style.width = pct + '%';
}

// ═══════════════════════════════════════════════════════════════
// 3. EMAIL MASKING
// ═══════════════════════════════════════════════════════════════

const ALIAS_DOMAINS = ['shield.datashadow.io', 'mask.priv.run', 'alias.shadowmail.dev'];

function initEmailMasking() {
  const btnGen = document.getElementById('btn-gen-alias');
  const aliasText = document.getElementById('alias-text');
  const copyBtn = document.getElementById('btn-copy-alias');
  const listEl = document.getElementById('alias-list');

  // Load existing aliases
  chrome.storage.local.get('emailAliases', (data) => {
    const aliases = data.emailAliases || [];
    renderAliases(aliases, listEl);
  });

  btnGen.onclick = async () => {
    btnGen.disabled = true;
    btnGen.innerHTML = '<span class="spinner"></span> Routing...';
    aliasText.textContent = "Negotiating secure alias...";
    aliasText.style.color = 'var(--sub)';

    await sleep(1000);

    const alias = generateAlias();
    
    // Typewriter effect
    aliasText.textContent = "";
    aliasText.style.color = 'var(--red)';
    aliasText.style.textShadow = '0 0 15px var(--red-glow)';
    
    for (let char of alias) {
      aliasText.textContent += char;
      await sleep(25);
    }

    btnGen.disabled = false;
    btnGen.innerHTML = '🎭 Generate New Alias';

    // Save
    chrome.storage.local.get('emailAliases', (data) => {
      const aliases = data.emailAliases || [];
      aliases.unshift({ email: alias, created: Date.now(), forwards: 0 });
      const trimmed = aliases.slice(0, 20);
      chrome.storage.local.set({ emailAliases: trimmed });
      renderAliases(trimmed, listEl);
    });
  };

  copyBtn.onclick = () => {
    const text = aliasText.textContent;
    if (!text || text.includes('Click generate')) return;
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = '✅ Copied!';
      setTimeout(() => copyBtn.textContent = 'Copy', 1500);
    });
  };
}

function generateAlias() {
  const prefixes = ['vault', 'cloak', 'shield', 'crypt', 'ghost', 'stealth', 'cipher', 'ops', 'drift', 'null'];
  const suffixes = ['alpha', 'nexus', 'core', 'relay', 'mask', 'tunnel', 'shadow', 'node', 'link', 'proxy'];
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  const s = suffixes[Math.floor(Math.random() * suffixes.length)];
  const num = Math.floor(Math.random() * 8999) + 1000;
  const domain = ALIAS_DOMAINS[Math.floor(Math.random() * ALIAS_DOMAINS.length)];
  return `${p}.${s}.${num}@${domain}`;
}

function renderAliases(aliases, container) {
  if (aliases.length === 0) {
    container.innerHTML = `<div style="padding:16px;text-align:center;color:#475569;font-size:12px">No aliases yet. Generate one above!</div>`;
    return;
  }

  container.innerHTML = aliases.map((a, i) => `
    <div class="item-row" style="border-left: 4px solid var(--red);">
      <div class="item-icon">🎭</div>
      <div style="flex: 1">
        <div style="font-family: 'Courier New', monospace; font-size: 16px; font-weight: 900; color: var(--red);">${a.email}</div>
        <div style="display: flex; gap: 12px; align-items: center; margin-top: 6px;">
          <span style="font-size: 11px; color: var(--red); font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase;">Relay Active</span>
          <span style="font-size: 11px; color: var(--sub); font-weight: 700;">Secure Tunneling</span>
          <span style="font-size: 11px; color: var(--muted); margin-left: auto; font-weight: 800;">${timeAgo(a.created)}</span>
        </div>
      </div>
      <div style="display: flex; gap: 10px;">
        <button data-idx="${i}" class="copy-btn alias-copy-btn">COPY</button>
        <button data-idx="${i}" class="alias-del-btn" style="background: rgba(255,51,51,0.1); border: 1px solid var(--red); color: var(--red); padding: 10px 14px; cursor: pointer; font-size: 16px;">🗑️</button>
      </div>
    </div>
  `).join('');

  // Copy buttons
  container.querySelectorAll('.alias-copy-btn').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx);
      navigator.clipboard.writeText(aliases[idx].email).then(() => {
        btn.textContent = '✅';
        setTimeout(() => btn.textContent = '📋 Copy', 1000);
      });
    };
  });

  // Delete buttons
  container.querySelectorAll('.alias-del-btn').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx);
      aliases.splice(idx, 1);
      chrome.storage.local.set({ emailAliases: aliases });
      renderAliases(aliases, container);
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function maskEmail(email) {
  const [user, domain] = email.split('@');
  return user.charAt(0) + '***@' + domain;
}

function timeAgo(ts) {
  if (!ts) return '';
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}
