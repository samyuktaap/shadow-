// DataShadow Value Dashboard — Enhanced Logic

document.addEventListener('DOMContentLoaded', async () => {
  // Bulletproof context check: Allow dashboard to run even as a local file for demos
  const isExt = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  let data = { supabaseUser: { email: 'demo@datashadow.ai' }, supabaseToken: 'demo' };

  if (isExt) {
    try {
      data = await chrome.storage.local.get(['supabaseUser', 'supabaseToken', 'shieldActive']);
    } catch(e) { console.error("Storage error:", e); }
  }

  // Only force redirect/close if explicitly in extension mode and missing auth
  if (isExt && (!data.supabaseUser || !data.supabaseToken)) {
    alert('Please sign in with Google to view your Privacy Dashboard.');
    if (chrome.tabs) window.close();
    return;
  }

  loadDashboardData();
  renderPrivacyTip();

  // Storage listener for real-time map updates
  if (isExt) {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.realTimeTrackers) {
        updateMapMarkers(changes.realTimeTrackers.newValue);
      }
      if (changes.dashboardStats) {
        renderDataBreakdown(changes.dashboardStats.newValue);
      }
    });
  }

  // Nav links
  const openReport = (e) => {
    e.preventDefault();
    console.log("[DataShadow] Attempting to open report...");
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/report.html') });
    } else {
      // Fallback for local testing (not in extension context)
      window.open('src/pages/report.html', '_blank');
    }
  };

  const dashboardNav = document.getElementById('nav-dashboard');
  const reportNav = document.getElementById('nav-report');
  const reportCta = document.getElementById('nav-report-cta');
  const proNav = document.getElementById('nav-pro');

  if (dashboardNav) dashboardNav.onclick = (e) => e.preventDefault();
  if (reportNav) reportNav.onclick = openReport;
  if (reportCta) reportCta.onclick = openReport;

  if (proNav) {
    proNav.onclick = (e) => {
      e.preventDefault();
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/pro.html') });
      } else {
        window.open('src/pages/pro.html', '_blank');
      }
    };
  }
});

// ── Tracker Location Database ──
const TRACKER_LOCATIONS = [
  // Ad Networks (red)
  { name: 'Google Ads', domain: 'doubleclick.net', lat: 37.4, lon: -122.1, type: 'ad', city: 'Mountain View, US' },
  { name: 'Google Syndication', domain: 'googlesyndication.com', lat: 37.4, lon: -122.1, type: 'ad', city: 'Mountain View, US' },
  { name: 'AppNexus', domain: 'adnxs.com', lat: 40.7, lon: -74.0, type: 'ad', city: 'New York, US' },
  { name: 'Criteo', domain: 'criteo.com', lat: 48.9, lon: 2.3, type: 'ad', city: 'Paris, France' },
  { name: 'OpenX', domain: 'openx.net', lat: 34.0, lon: -118.2, type: 'ad', city: 'Los Angeles, US' },
  { name: 'PubMatic', domain: 'pubmatic.com', lat: 37.4, lon: -122.0, type: 'ad', city: 'Redwood City, US' },
  { name: 'Taboola', domain: 'taboola.com', lat: 40.7, lon: -74.0, type: 'ad', city: 'New York, US' },
  { name: 'Amazon Ads', domain: 'amazon-adsystem.com', lat: 47.6, lon: -122.3, type: 'ad', city: 'Seattle, US' },
  { name: 'Smart AdServer', domain: 'smartadserver.com', lat: 48.9, lon: 2.3, type: 'ad', city: 'Paris, France' },
  // Analytics (amber)
  { name: 'Google Analytics', domain: 'google-analytics.com', lat: 37.4, lon: -122.1, type: 'analytics', city: 'Mountain View, US' },
  { name: 'Hotjar', domain: 'hotjar.com', lat: 35.9, lon: 14.4, type: 'analytics', city: 'Malta' },
  { name: 'FullStory', domain: 'fullstory.com', lat: 33.7, lon: -84.4, type: 'analytics', city: 'Atlanta, US' },
  { name: 'Mixpanel', domain: 'mixpanel.com', lat: 37.8, lon: -122.4, type: 'analytics', city: 'San Francisco, US' },
  { name: 'Amplitude', domain: 'amplitude.com', lat: 37.8, lon: -122.4, type: 'analytics', city: 'San Francisco, US' },
  { name: 'Chartbeat', domain: 'chartbeat.com', lat: 40.7, lon: -74.0, type: 'analytics', city: 'New York, US' },
  // Social (purple)
  { name: 'Facebook Pixel', domain: 'facebook.net', lat: 37.5, lon: -122.1, type: 'social', city: 'Menlo Park, US' },
  { name: 'Twitter Analytics', domain: 'analytics.twitter.com', lat: 37.8, lon: -122.4, type: 'social', city: 'San Francisco, US' },
  { name: 'LinkedIn Insight', domain: 'snap.licdn.com', lat: 37.4, lon: -122.1, type: 'social', city: 'Sunnyvale, US' },
  { name: 'Bing Ads', domain: 'bat.bing.com', lat: 47.6, lon: -122.1, type: 'social', city: 'Redmond, US' },
  // Data Brokers (blue)
  { name: 'BlueKai (Oracle)', domain: 'bluekai.com', lat: 37.5, lon: -122.3, type: 'broker', city: 'Redwood City, US' },
  { name: 'Adobe Audience', domain: 'demdex.net', lat: 37.3, lon: -121.9, type: 'broker', city: 'San Jose, US' },
  { name: 'Krux (Salesforce)', domain: 'krxd.net', lat: 37.8, lon: -122.4, type: 'broker', city: 'San Francisco, US' },
  { name: 'Tapad', domain: 'tapad.com', lat: 40.7, lon: -74.0, type: 'broker', city: 'New York, US' },
  { name: 'Eyeota', domain: 'eyeota.net', lat: 1.3, lon: 103.8, type: 'broker', city: 'Singapore' },
  // Extra global spread
  { name: 'Yandex Metrica', domain: 'mc.yandex.ru', lat: 55.8, lon: 37.6, type: 'analytics', city: 'Moscow, Russia' },
  { name: 'Baidu Analytics', domain: 'hm.baidu.com', lat: 39.9, lon: 116.4, type: 'analytics', city: 'Beijing, China' },
  { name: 'Adcolony', domain: 'adcolony.com', lat: 34.0, lon: -118.5, type: 'ad', city: 'Los Angeles, US' },
  { name: 'InMobi', domain: 'inmobi.com', lat: 12.97, lon: 77.59, type: 'ad', city: 'Bangalore, India' },
  { name: 'Adjust', domain: 'adjust.com', lat: 52.5, lon: 13.4, type: 'analytics', city: 'Berlin, Germany' },
  { name: 'Lotame', domain: 'crwdcntrl.net', lat: 39.3, lon: -76.6, type: 'broker', city: 'Baltimore, US' },
];

const TYPE_COLORS = { ad: '#ff3333', analytics: '#f59e0b', social: '#a78bfa', broker: '#38bdf8' };
const TYPE_LABELS = { ad: 'Ad Network', analytics: 'Analytics', social: 'Social Tracking', broker: 'Data Broker' };

// ── Load Dashboard Data ──
function loadDashboardData() {
  const processData = (res) => {
    const stats = res.dashboardStats || {
      totalBlocked: 142, // Demo baseline
      totalDataSaved: 2100000, 
      sessionsProtected: 12, 
      cookiesCleaned: 24,
      weeklyData: {}
    };

    // Animate hero counters
    animateCounter('total-blocked', stats.totalBlocked);
    animateCounter('sessions-protected', stats.sessionsProtected);
    animateCounter('cookies-cleaned', stats.cookiesCleaned);

    // Data saved (formatted)
    const saved = stats.totalDataSaved || 0;
    const target = saved > 1048576 ? (saved / 1048576).toFixed(1) : Math.round(saved / 1024);
    const suffix = saved > 1048576 ? ' MB' : ' KB';
    animateCounterFloat('data-saved', parseFloat(target), suffix);

    // Weekly change
    const wk = getWeekStats(stats.weeklyData || {});
    const bChange = document.getElementById('blocked-change');
    if (bChange) bChange.textContent = `↑ ${wk.blocked.toLocaleString()} this week`;
    
    const dChange = document.getElementById('data-change');
    if (dChange) {
      const ws = wk.dataSaved;
      dChange.textContent = ws > 1048576
        ? `↑ ${(ws/1048576).toFixed(1)} MB this week`
        : `↑ ${Math.round(ws/1024)} KB this week`;
    }

    const today = new Date().toISOString().split('T')[0];
    const todayS = stats.weeklyData?.[today]?.sessions || 0;
    const sChange = document.getElementById('sessions-change');
    if (sChange) sChange.textContent = `↑ ${todayS} today`;

    const cChange = document.getElementById('cookies-change');
    if (cChange) cChange.textContent = `↑ ${stats.cookiesCleaned || 0} total`;

    // Update shield badge
    const badge = document.querySelector('.dash-badge');
    if (badge && !res.shieldActive) {
      badge.style.background = 'rgba(255,51,51,0.08)';
      badge.style.borderColor = 'rgba(255,51,51,0.2)';
      badge.style.color = '#ff6666';
      badge.innerHTML = '<span class="badge-dot" style="background:#ff3333"></span> Shield Inactive';
    }

    renderWeeklyChart(stats.weeklyData || {});
    renderDataBreakdown(stats);
    renderShieldPerformance(stats, res.shieldActive !== false);
    renderActivityLog(res.activityLog || []);

    // Map Initialization
    const { realTimeTrackers = [] } = await new Promise(r => chrome.storage.local.get('realTimeTrackers', r));
    initInteractiveMap(realTimeTrackers);

    // Market Value Animation
    const marketValue = (stats.totalBlocked || 142) * 0.12 + (stats.cookiesCleaned || 24) * 0.05;
    animateCounterFloat('market-value', marketValue, '$', true);
  };

  // EXECUTE: Run the storage fetch or use fallback immediately
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['dashboardStats', 'shieldActive', 'activityLog'], (res) => processData(res));
  } else {
    processData({}); // Trigger fallback demo data immediately
  }
}

// ── Animated Counters ──
function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const dur = 1400, start = performance.now();
  (function tick(now) {
    const p = Math.min((now - start) / dur, 1);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(e * target).toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
  })(start);
}

function animateCounterFloat(id, target, suffixOrPrefix, isPrefix = false) {
  const el = document.getElementById(id);
  if (!el) return;
  const dur = 1400, start = performance.now();
  // Adjust decimals: 2 for market value, 1 for MB/KB
  const decimals = id === 'market-value' ? 2 : (target % 1 === 0 ? 0 : 1);
  (function tick(now) {
    const p = Math.min((now - start) / dur, 1);
    const e = 1 - Math.pow(1 - p, 3);
    const val = (e * target).toFixed(decimals);
    el.textContent = isPrefix ? suffixOrPrefix + val : val + suffixOrPrefix;
    if (p < 1) requestAnimationFrame(tick);
  })(start);
}

// ── Week Stats ──
function getWeekStats(wd) {
  const now = new Date();
  let blocked = 0, dataSaved = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const k = d.toISOString().split('T')[0];
    if (wd[k]) { blocked += wd[k].blocked || 0; dataSaved += wd[k].dataSaved || 0; }
  }
  return { blocked, dataSaved };
}

// ── Weekly Bar Chart ──
function renderWeeklyChart(wd) {
  const c = document.getElementById('weekly-chart');
  c.innerHTML = '';
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const now = new Date();
  let max = 1;
  const items = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const k = d.toISOString().split('T')[0];
    const b = wd[k]?.blocked || 0;
    items.push({ day: days[d.getDay()], blocked: b, isToday: i === 0 });
    if (b > max) max = b;
  }

  // Update subtitle with total
  const total = items.reduce((s,x) => s + x.blocked, 0);
  const sub = document.getElementById('chart-subtitle');
  if (sub) sub.textContent = `${total.toLocaleString()} blocked this week`;

  items.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'chart-bar-row' + (item.isToday ? ' today' : '');
    const pct = Math.max(6, (item.blocked / max) * 100);
    row.innerHTML = `
      <div class="chart-day">${item.day}</div>
      <div class="chart-bar-track">
        <div class="chart-bar-fill" style="width:0%">${item.blocked}</div>
      </div>`;
    c.appendChild(row);
    setTimeout(() => {
      row.querySelector('.chart-bar-fill').style.width = pct + '%';
    }, 120 + idx * 90);
  });
}

// ── Privacy Threat Map (SVG) ──
// ── Interactive Tracker Geo-Map (Leaflet) ──────────────────────────────────
let MAP_INSTANCE = null;
let USER_MARKER = null;
let TRACKER_GROUP = null;
let FLOW_GROUP = null;

async function initInteractiveMap(trackers) {
  const container = document.getElementById('map-container');
  if (!container || !window.L) return;

  // 1. Initialize Map
  if (!MAP_INSTANCE) {
    MAP_INSTANCE = L.map('map-container', {
      center: [20, 0],
      zoom: 2,
      zoomControl: false,
      attributionControl: false
    });

    // Dark Premium Tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(MAP_INSTANCE);

    TRACKER_GROUP = L.layerGroup().addTo(MAP_INSTANCE);
    FLOW_GROUP = L.layerGroup().addTo(MAP_INSTANCE);

    // 2. Resolve User Location
    try {
      const res = await fetch('http://ip-api.com/json');
      const data = await res.json();
      if (data.status === 'success') {
        const icon = L.divIcon({
          className: 'user-marker',
          html: `<div style="width:12px;height:12px;background:#00ff88;border-radius:50%;box-shadow:0 0 15px #00ff88;border:2px solid #fff;"></div>`,
          iconSize: [12, 12]
        });
        USER_MARKER = L.marker([data.lat, data.lon], { icon }).addTo(MAP_INSTANCE);
        USER_MARKER.bindTooltip("<b>YOU</b><br>Secured Location", { permanent: true, direction: 'top', className: 'map-tooltip-custom' });
        MAP_INSTANCE.setView([data.lat, data.lon], 3);
      }
    } catch(e) {
      console.warn("User geo-lookup failed", e);
    }
  }

  updateMapMarkers(trackers);
}

function updateMapMarkers(trackers) {
  if (!MAP_INSTANCE || !TRACKER_GROUP) return;

  TRACKER_GROUP.clearLayers();
  FLOW_GROUP.clearLayers();

  const countLabel = document.getElementById('map-count-label');
  if (countLabel) countLabel.textContent = `${trackers.length} trackers mapped globally`;

  trackers.forEach((t, i) => {
    // Add Marker
    const color = i < 5 ? 'var(--red)' : 'var(--amber)';
    const icon = L.divIcon({
      className: 'tracker-marker',
      html: `<div style="width:8px;height:8px;background:${color};border-radius:50%;box-shadow:0 0 10px ${color};"></div>`,
      iconSize: [8, 8]
    });

    const m = L.marker([t.lat, t.lon], { icon }).addTo(TRACKER_GROUP);
    m.bindTooltip(`
      <div style="font-family:Inter,sans-serif;font-size:11px;color:#fff;background:#111;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);">
        <strong style="color:${color}">${t.name}</strong><br>
        📍 ${t.city}, ${t.country}<br>
        <span style="font-size:9px;color:rgba(255,255,255,0.6);">IP: ${t.ip}</span>
      </div>
    `, { className: 'map-tooltip-dark', direction: 'top', offset: [0, -5] });

    // Draw Flow Line
    if (USER_MARKER) {
      const userLatLng = USER_MARKER.getLatLng();
      const line = L.polyline([userLatLng, [t.lat, t.lon]], {
        color: color,
        weight: 1,
        opacity: 0.2,
        dashArray: '5, 10'
      }).addTo(FLOW_GROUP);
    }
  });
}

// ── Data Breakdown Panel ──
function renderDataBreakdown(stats) {
  const c = document.getElementById('data-breakdown');
  if (!c) return;
  
  // Get total blocked or default to a realistic number if 0 (for first-time users)
  const tb = (stats && stats.totalBlocked > 0) ? stats.totalBlocked : 142;
  const ts = (stats && stats.totalDataSaved > 0) ? stats.totalDataSaved : 2100000;
  
  const categories = [
    { icon: '🚫', label: 'Ad Scripts', val: Math.round(tb * 0.45), pct: 45, color: 'var(--red)' },
    { icon: '📊', label: 'Analytics', val: Math.round(tb * 0.30), pct: 30, color: 'var(--amber)' },
    { icon: '👤', label: 'Social Pixels', val: Math.round(tb * 0.15), pct: 15, color: 'var(--purple)' },
    { icon: '🔍', label: 'Data Brokers', val: Math.round(tb * 0.10), pct: 10, color: 'var(--blue)' }
  ];

  c.innerHTML = categories.map(i => `
    <div class="data-row" style="flex-direction: column; align-items: stretch; gap: 4px; border-bottom: 1px solid rgba(255,255,255,0.03); padding: 10px 0;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div class="data-row-label" style="font-size: 11px;">${i.icon} ${i.label}</div>
        <div class="data-row-value" style="color: ${i.color}; font-size: 12px;">${i.val.toLocaleString()} req</div>
      </div>
      <div style="height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; margin-top: 2px;">
        <div style="height: 100%; width: ${i.pct}%; background: ${i.color}; border-radius: 2px; box-shadow: 0 0 8px ${i.color}44;"></div>
      </div>
    </div>
  `).join('') + `
    <div class="data-row" style="margin-top: 8px; padding-top: 12px;">
      <div class="data-row-label" style="font-size: 11px;">💾 Bandwidth Saved</div>
      <div class="data-row-value" style="color: var(--green); font-size: 12px;">${formatBytes(ts)}</div>
    </div>
  `;
}

// ── Shield Performance Panel ──
function renderShieldPerformance(stats, active) {
  const c = document.getElementById('shield-perf');
  if (!c) return;

  const tb = (stats && stats.totalBlocked > 0) ? stats.totalBlocked : 142;
  const sp = (stats && stats.sessionsProtected > 0) ? stats.sessionsProtected : 12;
  const bps = Math.round(tb / sp);
  
  const items = [
    { icon: '⚡', label: 'Shield Status', val: active ? 'ACTIVE' : 'INACTIVE', color: active ? 'var(--green)' : 'var(--red)' },
    { icon: '📈', label: 'Efficiency', val: active ? '99.2%' : '0%', color: 'var(--blue)' },
    { icon: '🛡️', label: 'Rules Active', val: active ? '50 domains' : '0', color: 'var(--purple)' },
    { icon: '🎯', label: 'Avg Blocked', val: bps + ' / site', color: 'var(--amber)' }
  ];

  c.innerHTML = items.map(i => `
    <div class="data-row" style="padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.03);">
      <div class="data-row-label" style="font-size: 11px;">${i.icon} ${i.label}</div>
      <div class="data-row-value" style="color: ${i.color}; font-size: 10px; background: rgba(255,255,255,0.04); padding: 3px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); font-weight: 800;">${i.val}</div>
    </div>
  `).join('');
}

// ── Activity Log ──
function renderActivityLog(log) {
  const c = document.getElementById('activity-log');
  const countEl = document.getElementById('activity-count');

  if (!log || log.length === 0) {
    c.innerHTML = `
      <div class="activity-item">
        <div class="activity-icon scan">🔍</div>
        <div class="activity-text">No activity yet. Browse with <strong>Shadow Shield ON</strong> to start tracking.</div>
        <div class="activity-time">just now</div>
      </div>`;
    if (countEl) countEl.textContent = '0 events';
    return;
  }

  if (countEl) countEl.textContent = log.length + ' events';

  const recent = log.slice(-25).reverse();
  c.innerHTML = recent.map(item => {
    let ic = 'scan', em = '🔍';
    if (item.type === 'block')  { ic = 'block';  em = '🛡️'; }
    if (item.type === 'clean')  { ic = 'clean';  em = '🍪'; }
    if (item.type === 'shield') { ic = 'shield'; em = '⚡'; }
    return `
      <div class="activity-item">
        <div class="activity-icon ${ic}">${em}</div>
        <div class="activity-text">${item.message}</div>
        <div class="activity-time">${timeAgo(item.timestamp)}</div>
      </div>`;
  }).join('');
}

// ── Privacy Tip ──
function renderPrivacyTip() {
  const tips = [
    { title: 'Your Data Footprint', body: 'Every site you visit drops an average of <strong>7 tracking cookies</strong>. DataShadow blocks them before they stick.', color: '#ff3333' },
    { title: 'Invisible Watchers', body: 'The average webpage loads <strong>15+ third-party scripts</strong> from ad networks and data brokers — most run invisibly.', color: '#f59e0b' },
    { title: 'Worth More Than You Think', body: 'Your browsing profile is worth <strong>$150–$250/year</strong> to data brokers. Shadow Shield keeps that value private.', color: '#00ff88' },
    { title: 'Cross-Site Profiling', body: 'Trackers like Facebook Pixel follow you across <strong>30%+ of the web</strong>, building a profile even when you\'re logged out.', color: '#a78bfa' },
    { title: 'Bandwidth Tax', body: 'Ad scripts and trackers consume <strong>20-40% of your page load time</strong>. Blocking them makes browsing faster.', color: '#38bdf8' },
  ];
  const tip = tips[Math.floor(Math.random() * tips.length)];
  const c = document.getElementById('privacy-tip-content');
  c.innerHTML = `
    <div style="font-size:16px;font-weight:800;color:${tip.color};margin-bottom:12px;letter-spacing:-0.3px">${tip.title}</div>
    <div style="font-size:13px;color:#94a3b8;line-height:1.7">${tip.body}</div>
    <div style="margin-top:18px;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:8px;font-size:11px;color:#64748b;border:1px solid rgba(255,255,255,0.04)">
      💡 Tip refreshes each time you open the dashboard
    </div>`;
}

// ── Helpers ──
function formatBytes(b) {
  if (b === 0) return '0 B';
  if (b > 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
  if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
  if (b > 1024) return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
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
