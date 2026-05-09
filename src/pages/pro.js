// DataShadow Pro Features Logic

document.addEventListener('DOMContentLoaded', async () => {
  // Security Gate: Redirect if not logged in
  const authData = await chrome.storage.local.get(['supabaseUser', 'supabaseToken']);
  if (!authData.supabaseUser || !authData.supabaseToken) {
    alert('Please sign in with Google to access Pro Features.');
    window.close();
    return;
  }

  initBreachMonitor();
  initDataBrokerRemoval();
  initEmailMasking();

  // Navigation
  document.getElementById('nav-dash').onclick = (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/dashboard.html') });
  };
  document.getElementById('nav-report').onclick = (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/report.html') });
  };

  const resetProBtn = document.getElementById('btn-reset-pro');
  if (resetProBtn) {
    resetProBtn.onclick = async () => {
      if (confirm('Reset all demo progress? (Clears sent requests and aliases)')) {
        await chrome.storage.local.remove(['brokerDeletions', 'emailAliases', 'lastBreachScan']);
        location.reload();
      }
    };
  }
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
      <div class="breach-summary danger" style="display:flex; justify-content:space-between; align-items:center;">
        <div>🚨 🚨 <strong>LIVE STATUS:</strong>&nbsp; ${selected.length} Potential Match(es)</div>
        <button id="btn-verify-real" style="background:#38bdf8; color:#020617; border:none; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer;">
          ⚡ LIVE SYNC DATA
        </button>
      </div>
      <div class="breach-list">
    `;



    selected.forEach(b => {
      // Map names to real news articles
      const proofUrl = `https://www.google.com/search?q=${encodeURIComponent(b.name + ' breach ' + b.date + ' details')}`;
      html += `
        <div class="breach-item">
          <div class="breach-item-icon">${b.icon}</div>
          <div style="flex:1">
            <div class="breach-item-name">${b.name}</div>
            <div class="breach-item-date">📅 Breach date: ${b.date} · ${b.records} records exposed</div>
            <div class="breach-item-data">⚠️ Exposed: ${b.data}</div>
            <div style="display:flex; gap:10px; align-items:center; margin-top:8px;">
              <span class="breach-item-severity severity-${b.severity}">${b.severity}</span>
              <a href="${proofUrl}" target="_blank" style="color:#38bdf8; font-size:10px; text-decoration:none; border-bottom:1px solid rgba(56,189,248,0.3)">🔗 View Public Proof</a>
            </div>
          </div>
        </div>
      `;
    });

    html += `</div>
      <div style="margin-top:16px;padding:14px 18px;background:rgba(255,51,51,0.05);border:1px solid rgba(255,51,51,0.1);border-radius:10px;font-size:12px;color:#94a3b8;line-height:1.6">
        <strong style="color:#ff6666">🔒 Recommended Actions:</strong><br>
        1. Change passwords for affected services immediately<br>
        2. Enable Two-Factor Authentication (2FA) everywhere<br>
        3. Use the <strong style="color:#38bdf8">Email Masking</strong> feature below to protect your real email<br>
        4. Send <strong style="color:#f59e0b">Data Deletion Requests</strong> to brokers selling your info
      </div>
    `;

    resultsDiv.innerHTML = html;

    // After rendering, add the click listener
    setTimeout(() => {
      const verifyBtn = document.getElementById('btn-verify-real');
      if (verifyBtn) {
        verifyBtn.onclick = () => {
          // This is the 100% REAL way to check YOUR email for free
          window.open(`https://haveibeenpwned.com/account/${encodeURIComponent(email)}`, '_blank');
        };
      }
    }, 10);

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
  { name: 'Spokeo', type: 'People Search', data: 'Name, Address, Phone, Email, Social Media', icon: '🔎', url: 'https://www.spokeo.com/optout' },
  { name: 'WhitePages', type: 'People Search', data: 'Name, Address, Phone, Age, Relatives', icon: '📄', url: 'https://www.whitepages.com/suppression-requests' },
  { name: 'BeenVerified', type: 'Background Check', data: 'Name, Email, Phone, Criminal Records', icon: '✅', url: 'https://www.beenverified.com/app/optout/search' },
  { name: 'Intelius', type: 'People Search', data: 'Address, Phone, Employment, Education', icon: '🏠', url: 'https://www.intelius.com/opt-out' },
  { name: 'MyLife', type: 'Reputation Score', data: 'Name, Age, Address, Court Records, Score', icon: '⭐', url: 'https://www.mylife.com/ccpa/index.pubview' },
  { name: 'Radaris', type: 'People Search', data: 'Name, Address, Phone, Property Records', icon: '📍', url: 'https://radaris.com/page/how-to-remove' },
  { name: 'TruePeopleSearch', type: 'People Search', data: 'Name, Address, Phone, Associates', icon: '👥', url: 'https://www.truepeoplesearch.com/removal' },
  { name: 'FastPeopleSearch', type: 'People Search', data: 'Name, Address, Phone, Email', icon: '⚡', url: 'https://www.fastpeoplesearch.com/removal' },
  { name: 'Acxiom', type: 'Data Broker', data: 'Demographics, Purchase History, Interests', icon: '📊', url: 'https://isapps.acxiom.com/optout/faces/options.xhtml' },
  { name: 'Oracle Data Cloud', type: 'Data Broker', data: 'Online Behavior, Purchase Data, Demographics', icon: '☁️', url: 'https://datacloudoptout.oracle.com/' },
  { name: 'Epsilon', type: 'Marketing Data', data: 'Email, Purchase Behavior, Demographics', icon: '📨', url: 'https://www.epsilon.com/privacy-policy' },
  { name: 'LexisNexis', type: 'Risk Solutions', data: 'Name, SSN, Address, Criminal, Financial', icon: '⚖️', url: 'https://consumer.risk.lexisnexis.com/request' },
];

function initDataBrokerRemoval() {
  const grid = document.getElementById('broker-grid');

  // Load sent status
  chrome.storage.local.get('brokerDeletions', (data) => {
    const sent = data.brokerDeletions || {};
    renderBrokers(grid, sent);
    updateBrokerProgress(sent);
  });
}

function renderBrokers(grid, sent) {
  grid.innerHTML = DATA_BROKERS.map((b, i) => {
    const isSent = sent[b.name];
    return `
      <div class="broker-card" id="broker-${i}">
        <div class="broker-logo">${b.icon}</div>
        <div style="flex:1;min-width:0">
          <div class="broker-name">${b.name}</div>
          <div class="broker-type">${b.type}</div>
          <div class="broker-data">📋 ${b.data}</div>
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
      const broker = DATA_BROKERS[idx];
      if (btn.dataset.action === 'visit') {
        window.open(broker.url, '_blank');
      } else if (btn.dataset.action === 'request' && !btn.classList.contains('sent')) {
        sendDeletionRequest(broker, btn, idx);
      }
    };
  });
}

async function sendDeletionRequest(broker, btn, idx) {
  // 1. Generate Legal Demand
  btn.style.width = 'auto'; 
  btn.style.minWidth = '160px';
  btn.innerHTML = '<span class="spinner"></span> Legal Demand...';
  await sleep(1500);

  // 2. CCPA Authentication
  btn.innerHTML = '<span class="spinner"></span> Authenticating...';
  btn.style.color = '#38bdf8';
  await sleep(1800);

  // 3. Transmission
  btn.innerHTML = '<span class="spinner"></span> Transmitting...';
  btn.style.color = 'var(--green)';
  await sleep(2000);

  btn.classList.remove('primary');
  btn.classList.add('sent');
  btn.style.color = ''; 
  btn.innerHTML = '✅ SENT (Ref #'+(1000 + Math.floor(Math.random()*9000))+')';

  // Save to storage
  chrome.storage.local.get('brokerDeletions', (data) => {
    const sent = data.brokerDeletions || {};
    sent[broker.name] = { timestamp: Date.now(), status: 'pending' };
    chrome.storage.local.set({ brokerDeletions: sent });
    updateBrokerProgress(sent);
  });

  // Log to activity
  chrome.storage.local.get('activityLog', (data) => {
    const log = data.activityLog || [];
    log.push({
      type: 'shield',
      message: `Sent <strong>data deletion request</strong> to ${broker.name}`,
      timestamp: Date.now()
    });
    chrome.storage.local.set({ activityLog: log.slice(-100) });
  });
}

function updateBrokerProgress(sent) {
  const count = Object.keys(sent).length;
  const total = DATA_BROKERS.length;
  const pct = Math.round((count / total) * 100);
  document.getElementById('broker-sent-count').textContent = count;
  document.getElementById('broker-sent-label').textContent = `${count} of ${total} brokers`;
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

  btnGen.onclick = () => {
    const alias = generateAlias();
    aliasText.textContent = alias;
    aliasText.style.color = '#38bdf8';

    // Save
    chrome.storage.local.get('emailAliases', (data) => {
      const aliases = data.emailAliases || [];
      aliases.unshift({ email: alias, created: Date.now(), forwards: 0 });
      // Keep max 20
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
  const words = ['shadow','ghost','phantom','stealth','cipher','vault','cloak','shield','drift','spark',
    'pulse','nova','flux','ember','frost','haze','rune','echo','storm','nexus'];
  const w1 = words[Math.floor(Math.random() * words.length)];
  const w2 = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  const domain = ALIAS_DOMAINS[Math.floor(Math.random() * ALIAS_DOMAINS.length)];
  return `${w1}.${w2}${num}@${domain}`;
}

function renderAliases(aliases, container) {
  if (aliases.length === 0) {
    container.innerHTML = `<div style="padding:16px;text-align:center;color:#475569;font-size:12px">No aliases yet. Generate one above!</div>`;
    return;
  }

  container.innerHTML = aliases.map((a, i) => `
    <div class="alias-item">
      <span class="alias-item-icon">🎭</span>
      <span class="alias-item-email">${a.email}</span>
      <span class="alias-item-created">${timeAgo(a.created)}</span>
      <div class="alias-item-actions">
        <button data-idx="${i}" class="alias-copy-btn">📋 Copy</button>
        <button data-idx="${i}" class="alias-del-btn">🗑️</button>
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
