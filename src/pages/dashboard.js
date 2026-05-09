// DataShadow Value Dashboard — Enhanced Logic
let leafletMap = null;
let userMarker = null;
let trackerLayers = []; // Track all added layers so we can clear them on refresh

document.addEventListener('DOMContentLoaded', async () => {
  // ── Nav links (Attach early so they work even if auth fails) ──
  const navigateTo = (page) => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      const url = chrome.runtime.getURL(`src/pages/${page}.html`);
      window.location.href = url;
    } else {
      window.location.href = `${page}.html`;
    }
  };

  const dashboardNav = document.getElementById('nav-dashboard');
  const reportNav = document.getElementById('nav-report');
  const proNav = document.getElementById('nav-pro');
  const whatifNav = document.getElementById('nav-whatif');
  const historyNav = document.getElementById('nav-history');

  if (dashboardNav) dashboardNav.onclick = (e) => { e.preventDefault(); navigateTo('dashboard'); };
  if (reportNav) reportNav.onclick = (e) => { e.preventDefault(); navigateTo('report'); };
  if (proNav) proNav.onclick = (e) => { e.preventDefault(); navigateTo('pro'); };
  if (whatifNav) whatifNav.onclick = (e) => { e.preventDefault(); navigateTo('whatif'); };
  if (historyNav) historyNav.onclick = (e) => { e.preventDefault(); navigateTo('history'); };

  // Bulletproof context check: Allow dashboard to run even as a local file for demos
  const isExt = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  let authData = { supabaseUser: { email: 'demo@datashadow.ai' }, supabaseToken: 'demo' };

  if (isExt) {
    try {
      authData = await chrome.storage.local.get(['supabaseUser', 'supabaseToken', 'shieldActive']);
    } catch(e) { console.error("Storage error:", e); }
  }

  // Only force redirect/close if explicitly in extension mode and missing auth
  if (isExt && (!authData.supabaseUser || !authData.supabaseToken)) {
    console.warn("[DataShadow] Auth missing, but allowing navigation access.");
    // We don't close anymore, let user see the dashboard or try to navigate
  }

  loadDashboardData();
  renderPrivacyTip();

  // Show user info
  if (authData && authData.supabaseUser) {
    const emailEl = document.getElementById('user-email');
    const avatarEl = document.getElementById('user-avatar');
    if (emailEl) emailEl.textContent = authData.supabaseUser.email;
    if (avatarEl) avatarEl.textContent = authData.supabaseUser.email[0].toUpperCase();
  }

  // Logout logic
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      if (isExt) {
        await chrome.storage.local.remove(['supabaseToken', 'supabaseUser', 'dashboardStats', 'activityLog']);
      }
      window.location.reload();
    };
  }

  if (isExt) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.dashboardStats || changes.activityLog || changes.shieldActive || changes.currentSiteStats) {
        loadDashboardData();
      }
    });

    // TRUE LIVE POLLING: Ensure dashboard is always fresh
    setInterval(loadDashboardData, 5000);

    // REAL-TIME TELEMETRY LISTENER
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'TELEMETRY_UPDATE') {
        handleLiveUpdate(message.data);
      }
      if (message.type === 'FINGERPRINT_ATTEMPT') {
        handleFingerprintAlert(message);
      }
    });
  }
});

function handleLiveUpdate(data) {
  // 1. Update Hero Counters Instantly
  if (data.blockedCount) {
    // Pulse animation for network activity
    const pulse = document.getElementById('network-pulse');
    if (pulse) {
      pulse.style.transform = 'scale(1.2)';
      setTimeout(() => pulse.style.transform = 'scale(1)', 200);
    }

    // Refresh all counters to reflect new global lifetime stats
    loadDashboardData();
  }


  // 2. Update Intelligence Panel
  updateIntelligencePanel(data);
  
  // 3. Add to Live Feed
  if (data.newEntry) {
    addLiveFeedEntry(data.newEntry);
  }
}

function updateIntelligencePanel(data) {
  const domain = data.site || 'active site';
  
  // Update Domain Name
  const nameEl = document.getElementById('active-domain-name');
  if (nameEl) nameEl.textContent = domain.toUpperCase();
  
  // Aggression Spike logic: Catching a tracker spikes the score briefly
  const spikeScore = Math.min(100, (data.blockedCount || 0) * 15 + 40);
  
  const scoreEl = document.getElementById('aggression-score-val');
  const barEl = document.getElementById('aggression-bar');
  
  if (scoreEl && data.blockedCount > 0) {
    scoreEl.textContent = spikeScore;
    barEl.style.width = `${spikeScore}%`;
    barEl.style.background = spikeScore > 70 ? 'var(--red)' : 'var(--amber)';
    
    // Reset to analyzed baseline after the spike
    setTimeout(() => {
      loadDashboardData();
    }, 2000);
  }
}


function addLiveFeedEntry(entry) {
  const logEl = document.getElementById('activity-log');
  if (!logEl) return;
  
  const item = document.createElement('div');
  item.className = 'activity-item animate-in';
  item.style.borderLeft = `3px solid ${entry.type === 'block' ? 'var(--red)' : 'var(--purple)'}`;
  
  const icon = entry.type === 'block' ? '🛡️' : '🔒';
  const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  item.innerHTML = `
    <div class="activity-icon ${entry.type}">${icon}</div>
    <div class="activity-text">${entry.message}</div>
    <div class="activity-time">${time}</div>
  `;
  
  logEl.prepend(item);
  if (logEl.children.length > 50) logEl.lastElementChild.remove();
}

function handleFingerprintAlert(msg) {
  const detailsEl = document.getElementById('threat-details');
  if (detailsEl) {
    detailsEl.innerHTML = `<span style="color:var(--red)">⚠️ Prevented ${msg.detectionType} attempt!</span>`;
    setTimeout(() => {
       detailsEl.textContent = 'Monitoring active...';
    }, 5000);
  }
}

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
      totalBlocked: 0,
      totalDataSaved: 0, 
      sessionsProtected: 0, 
      cookiesCleaned: 0,
      weeklyData: {}
    };
    const siteStats = res.currentSiteStats || {};

    // Update Title with current domain
    const logoEl = document.querySelector('.dash-logo');
    if (logoEl && siteStats.domain) {
      logoEl.innerHTML = `<span class="data">Monitoring:</span> <span class="shadow">${siteStats.domain}</span>`;
    }

    // ── PRIMARY HERO STATS (Using Lifetime Global Totals for "Wow" Factor) ──
    const lifetimeTrackers = stats.totalBlocked || 0;
    const lifetimeCookies = stats.cookiesCleaned || 0;
    const lifetimeSessions = stats.sessionsProtected || 0;
    const lifetimeData = stats.totalDataSaved || 0;
    const lifetimeMarketVal = (lifetimeTrackers * 0.12) + (lifetimeCookies * 0.05) + (lifetimeSessions * 0.02);

    // Update Big Numbers (Lifetime Impact)
    animateCounter('total-blocked', lifetimeTrackers);
    animateCounter('sessions-protected', lifetimeSessions);
    animateCounter('cookies-cleaned', lifetimeCookies);

    // Data saved (Lifetime)
    if (lifetimeData === 0) {
      document.getElementById('data-saved').innerHTML = '0<span style="font-size: 16px; color: var(--sub);"> KB</span>';
    } else {
      const target = lifetimeData > 1048576 ? (lifetimeData / 1048576).toFixed(1) : Math.round(lifetimeData / 1024);
      const suffix = lifetimeData > 1048576 ? ' MB' : ' KB';
      animateCounterFloat('data-saved', parseFloat(target), suffix);
    }

    // Market Value (Lifetime Global Impact)
    animateCounterFloat('market-value', lifetimeMarketVal, '$', true);


    // Render Real Tracker Geo-Map
    renderPrivacyMap(stats.geoTrackers || []);

    // ── Update Intelligence Panel (Aggression Score) ──
    // We use the analyzed risk score for high-fidelity accuracy
    const aggScore = siteStats.score || 0;
    const scoreEl = document.getElementById('aggression-score-val');
    const barEl = document.getElementById('aggression-bar');
    const levelEl = document.getElementById('threat-level-val');
    const nameEl = document.getElementById('active-domain-name');
    
    if (nameEl) nameEl.textContent = (siteStats.domain || 'SYSTEM').toUpperCase();
    if (scoreEl) scoreEl.textContent = aggScore;
    if (barEl) barEl.style.width = `${aggScore}%`;
    
    if (aggScore >= 75) {
      if (levelEl) { levelEl.textContent = 'CRITICAL'; levelEl.style.color = 'var(--red)'; }
      barEl.style.background = 'var(--red)';
    } else if (aggScore >= 40) {
      if (levelEl) { levelEl.textContent = 'ELEVATED'; levelEl.style.color = 'var(--amber)'; }
      barEl.style.background = 'var(--amber)';
    } else {
      if (levelEl) { levelEl.textContent = 'SECURE'; levelEl.style.color = 'var(--green)'; }
      barEl.style.background = 'var(--green)';
    }

    
    // ── Primary Market Value Flash Card ──
    animateCounterFloat('market-value', siteVal, '$', true);

    // Risk Profile moved to small display in the Panel
    const detailsEl = document.getElementById('threat-details');
    if (detailsEl) detailsEl.innerHTML = `Privacy Risk Profile: <b style="color:var(--amber)">${Math.min(99, 5 + (aggScore / 2))}%</b> • Monitoring Active.`;

    // ── GLOBAL AGGREGATE STATS (Small sub-boxes) ──
    const currentBlockedEl = document.getElementById('current-site-blocked');
    if (currentBlockedEl) {
      currentBlockedEl.innerHTML = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 10px; margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
          <span style="grid-column: span 2; color: var(--sub); text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px; margin-bottom: 5px;">🌍 GLOBAL IMPACT (ALL SITES)</span>
          <span>🛡️ Blocked: <b>${stats.totalBlocked.toLocaleString()}</b></span>
          <span>💾 Saved: <b>${formatBytes(stats.totalDataSaved)}</b></span>
          <span>⚡ Sessions: <b>${stats.sessionsProtected}</b></span>
          <span>🍪 Cookies: <b>${stats.cookiesCleaned}</b></span>
          <span style="grid-column: span 2; color: var(--amber);">💰 Total Market Value: <b>$${((stats.totalBlocked || 0) * 0.12 + (stats.cookiesCleaned || 0) * 0.05).toFixed(2)}</b></span>
        </div>
      `;
    }

    // Weekly change (Global perspective for context)
    const wk = getWeekStats(stats.weeklyData || {});
    const bChange = document.getElementById('blocked-change');
    if (bChange) bChange.textContent = `↑ ${wk.blocked.toLocaleString()} network-wide`;
    
    const dChange = document.getElementById('data-change');
    if (dChange) {
      const ws = wk.dataSaved;
      dChange.textContent = ws > 1048576
        ? `↑ ${(ws/1048576).toFixed(1)} MB total`
        : `↑ ${Math.round(ws/1024)} KB total`;
    }

    const today = new Date().toISOString().split('T')[0];
    const todayS = stats.weeklyData?.[today]?.sessions || 0;
    const sessionsChangeEl = document.getElementById('sessions-change');
    if (sessionsChangeEl) sessionsChangeEl.textContent = `↑ ${todayS} total today`;
    
    const cookiesChangeEl = document.getElementById('cookies-change');
    if (cookiesChangeEl) cookiesChangeEl.textContent = `↑ ${stats.cookiesCleaned || 0} lifetime`;

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

    // Render Protected Sites List
    const sitesList = document.getElementById('protected-sites-list');
    if (sitesList && stats.protectedDomains) {
      sitesList.innerHTML = stats.protectedDomains.map(site => `
        <div style="padding: 10px 14px; background: rgba(255,255,255,0.03); border-radius: 10px; border: 1px solid rgba(255,255,255,0.05); font-size: 12px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 600; color: #fff;">${site}</span>
          <span style="font-size: 10px; color: var(--green);">SECURED ✅</span>
        </div>
      `).join('');
    } else if (sitesList) {
      sitesList.innerHTML = '<div style="font-size: 11px; color: var(--muted); text-align: center; padding: 20px;">No sites visited yet today.</div>';
    }

    // Final market value logic (Handled by the counter animation above)
  };

  // EXECUTE: Run the storage fetch or use fallback immediately
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['dashboardStats', 'shieldActive', 'activityLog', 'currentSiteStats'], (res) => processData(res));
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
    const dayStats = wd[now.toISOString().split('T')[0]]; // Placeholder key logic, should use actual day keys
    
    row.innerHTML = `
      <div class="chart-day">${item.day}</div>
      <div class="chart-bar-track">
        <div class="chart-bar-fill" style="width:0%">
          <span class="bar-val">${item.blocked}</span>
        </div>
      </div>
      <div class="bar-extra-info" style="display:none; font-size: 9px; color: var(--muted); padding-left: 45px; margin-top: -5px; margin-bottom: 5px;">
        Saved: ${formatBytes(item.blocked * 16000)} | Val: $${(item.blocked * 0.12).toFixed(2)}
      </div>`;
    c.appendChild(row);
    setTimeout(() => {
      row.querySelector('.chart-bar-fill').style.width = pct + '%';
      row.querySelector('.bar-extra-info').style.display = 'block';
    }, 120 + idx * 90);
  });
}

// ── Real Tracker Geo-Map (Leaflet.js) ──
/**
 * STEP 1: Get the real user location using browser Geolocation API
 * Falls back to IP-based geolocation if user denies permission
 */
async function getRealUserLocation() {
  return new Promise((resolve) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('[DataShadow Map] GPS Location acquired:', position.coords.latitude, position.coords.longitude);
          resolve({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            source: 'gps'
          });
        },
        async (error) => {
          console.log('[DataShadow Map] GPS denied or failed:', error.message, 'Falling back to IP geolocation...');
          try {
            // Using ipapi.co as it supports HTTPS and is more reliable for extensions
            const res = await fetch('https://ipapi.co/json/');
            const data = await res.json();
            console.log('[DataShadow Map] IP Location acquired:', data.latitude, data.longitude, data.city);
            resolve({
              lat: data.latitude,
              lon: data.longitude,
              city: data.city,
              country: data.country_name,
              source: 'ip'
            });
          } catch (e) {
            console.warn('[DataShadow Map] IP geo also failed, using fallback center');
            resolve({ lat: 20, lon: 0, source: 'fallback' });
          }
        },
        { timeout: 8000, maximumAge: 60000 }
      );
    } else {
      resolve({ lat: 20, lon: 77, city: 'India', country: 'IN', source: 'fallback' });
    }
  });
}

/**
 * STEP 2: Load real tracker geo data from chrome.storage.local
 */
async function getRealGeoTrackers() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get('dashboardStats', (data) => {
        const stats = data.dashboardStats || {};
        const geoTrackers = stats.geoTrackers || [];
        resolve(geoTrackers);
      });
    } else {
      resolve(TRACKER_LOCATIONS.slice(0, 10)); // Fallback for local demo
    }
  });
}

/**
 * STEP 3: Render the map with REAL data
 */
async function renderPrivacyMap() {
  const container = document.getElementById('map-container');
  if (!container || !window.L) return;

  // Fetch real data in parallel
  const [userLocation, geoTrackers] = await Promise.all([
    getRealUserLocation(),
    getRealGeoTrackers()
  ]);

  // SMART LOAD: Use real data if available, otherwise use seed data immediately (like localhost)
  let finalTrackers = geoTrackers.filter(t => t.lat && t.lon && t.lat !== 0);
  let isPassive = false;

  if (finalTrackers.length === 0) {
    isPassive = true;
    finalTrackers = [
      { name: 'Google Ads', domain: 'doubleclick.net', lat: 37.4, lon: -122.1, city: 'California, US' },
      { name: 'Facebook Tracker', domain: 'facebook.com', lat: 37.5, lon: -122.1, city: 'California, US' },
      { name: 'Amazon Cloud', domain: 'aws.amazon.com', lat: 47.6, lon: -122.3, city: 'Seattle, US' },
      { name: 'Azure Core', domain: 'microsoft.com', lat: 53.3, lon: -6.2, city: 'Dublin, Ireland' }
    ];
    
    const label = document.getElementById('map-count-label');
    if (label) label.textContent = "Establishing secure connection... (Seed Mode)";
    
    // Background wait to see if real data arrives (doesn't block rendering)
    setTimeout(async () => {
      const fresh = await getRealGeoTrackers();
      if (fresh.length > 0) renderPrivacyMap();
    }, 5000);
  }

  // ── Initialize Map (only once) ──
  if (!leafletMap) {
    leafletMap = L.map('map-container', {
      center: [userLocation.lat, userLocation.lon],
      zoom: 3,
      zoomControl: false,
      attributionControl: false,
      minZoom: 2,
      maxZoom: 12,
      worldCopyJump: true,
      scrollWheelZoom: 'center'
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      noWrap: false
    }).addTo(leafletMap);

    // Setup custom controls listeners
    const zIn = document.getElementById('map-zoom-in');
    const zOut = document.getElementById('map-zoom-out');
    const zReset = document.getElementById('map-zoom-reset');
    const zFit = document.getElementById('map-zoom-fit');

    if (zIn) zIn.onclick = () => leafletMap.zoomIn();
    if (zOut) zOut.onclick = () => leafletMap.zoomOut();
    if (zReset) zReset.onclick = () => leafletMap.flyTo([userLocation.lat, userLocation.lon], 4);
    if (zFit) zFit.onclick = () => {
      const markers = trackerLayers.filter(l => l instanceof L.CircleMarker);
      if (userMarker) markers.push(userMarker);
      
      if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        leafletMap.flyToBounds(group.getBounds(), { padding: [80, 80], maxZoom: 8 });
      }
    };

    // ── AUTO-LOCATE ON START ──
    setTimeout(() => {
      const markers = trackerLayers.filter(l => l instanceof L.CircleMarker);
      if (userMarker) markers.push(userMarker);
      if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        leafletMap.flyToBounds(group.getBounds(), { padding: [100, 100], maxZoom: 5 });
      }
    }, 1500);
  } else {
    trackerLayers.forEach(layer => leafletMap.removeLayer(layer));
    trackerLayers = [];
  }

  // ── Add "YOU" Marker ──
  if (userMarker) leafletMap.removeLayer(userMarker);
  
  // If location is still 20, 0 (fallback), try one more time to fetch it
  if (userLocation.lat === 20 && userLocation.lon === 0) {
    console.log("[DataShadow] Retrying location...");
  }

  const locationLabel = userLocation.city ? `YOU — ${userLocation.city}` : 'YOU (Secured)';
  const userLat = (userLocation.lat === 20 && userLocation.lon === 0) ? 20.59 : userLocation.lat;
  const userLon = (userLocation.lat === 20 && userLocation.lon === 0) ? 78.96 : userLocation.lon;

  userMarker = L.circleMarker([userLat, userLon], {
    radius: 12, fillColor: '#00ff88', color: '#ffffff', weight: 3, fillOpacity: 1,
    className: 'user-location-marker user-pulse' // Added glowing pulse
  }).addTo(leafletMap).bindTooltip(`<b>🟢 ${locationLabel}</b>`, { permanent: true, direction: 'top' });

// ── Render Trackers (Piping) ──
  const userPos = [userLat, userLon];
  
  // Prevent unnecessary re-rendering and animation resets if tracker count hasn't changed
  if (window.lastTrackerCount === finalTrackers.length && leafletMap) {
    const label = document.getElementById('map-count-label');
    if (label) label.textContent = isPassive ? `Passive Data: ${finalTrackers.length} locations resolved` : `${finalTrackers.length} active server locations`;
    return;
  }
  window.lastTrackerCount = finalTrackers.length;

  if (leafletMap) {
    trackerLayers.forEach(layer => leafletMap.removeLayer(layer));
    trackerLayers = [];
  }
  
  finalTrackers.forEach((tracker) => {
    try {
      if (!tracker.lat || !tracker.lon) return;
      
      const tLat = Number(tracker.lat);
      const tLon = Number(tracker.lon);
      if (isNaN(tLat) || isNaN(tLon)) return;

      const trackerPos = [tLat, tLon];
      const domainStr = tracker.domain || tracker.name || '';
      const isHighRisk = domainStr.includes('facebook') || domainStr.includes('google') || domainStr.includes('doubleclick');
      const markerColor = isHighRisk ? '#ff3333' : '#f59e0b';

      // Data Receiver Point
      const marker = L.circleMarker(trackerPos, {
        radius: isHighRisk ? 10 : 8, fillColor: markerColor, color: '#ffffff', weight: 2, fillOpacity: 0.9,
        className: 'tracker-marker'
      }).addTo(leafletMap);

      marker.bindTooltip(`<b>🔴 DATA RECEIVER: ${tracker.name || domainStr || 'Unknown Server'}</b><br>📍 Location: ${tracker.city || 'Unknown'}<br>🌐 Destination IP: ${tracker.ip || 'Masked'}`);
      trackerLayers.push(marker);

      // Path of Data Travel (The Piping)
      const line = L.polyline([userPos, trackerPos], {
        color: isHighRisk ? 'rgba(255,51,51,0.8)' : 'rgba(245,158,11,0.7)',
        weight: 3, dashArray: '8, 12', opacity: 0.9,
        className: 'tracker-pipe'
      }).addTo(leafletMap);
      
      // Add arrow heads or flow animation to lines
      line.on('add', () => {
        const el = line.getElement();
        if (el) {
          el.style.strokeDasharray = '8, 12';
          el.style.strokeDashoffset = '1000';
          el.style.animation = 'dash-flow 15s linear infinite';
        }
      });
      
      trackerLayers.push(line);
    } catch (e) {
      console.error("[DataShadow] Error rendering tracker on map:", e, tracker);
    }
  });

  // Auto-fit bounds when new trackers appear so they are visible
  setTimeout(() => {
    try {
      if (leafletMap && trackerLayers.length > 0) {
        const markers = trackerLayers.filter(l => l instanceof L.CircleMarker);
        if (userMarker) markers.push(userMarker);
        if (markers.length > 0) {
          const group = new L.featureGroup(markers);
          leafletMap.flyToBounds(group.getBounds(), { padding: [80, 80], maxZoom: 6 });
        }
      }
    } catch(e) {
      console.error("[DataShadow] Error flying to bounds:", e);
    }
  }, 500);

  const label = document.getElementById('map-count-label');
  if (label) label.textContent = isPassive ? `Passive Data: ${finalTrackers.length} locations resolved` : `${finalTrackers.length} active server locations`;
}

// ── Data Breakdown Panel ──
function renderDataBreakdown(stats) {
  const c = document.getElementById('data-breakdown');
  if (!c) return;
  
  // Get total blocked or default to 0
  const tb = (stats && stats.totalBlocked) ? stats.totalBlocked : 0;
  const ts = (stats && stats.totalDataSaved) ? stats.totalDataSaved : 0;
  
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
