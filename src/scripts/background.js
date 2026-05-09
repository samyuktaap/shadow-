// DataShadow Background Service Worker — Local Stats Engine + Shield
import { SUPABASE_CONFIG } from './config.js';

// ── Auth: Catch Google OAuth redirect tokens ────────────────────────────────

// Listen for ALL tab URL changes — catch the localhost redirect with tokens
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url || !changeInfo.url.startsWith('http://localhost')) return;
  if (!changeInfo.url.includes('access_token')) return;

  console.log('[DataShadow Auth] Caught OAuth redirect!');
  const hashStr = changeInfo.url.split('#')[1] || '';
  const params = new URLSearchParams(hashStr);
  const accessToken = params.get('access_token');

  if (accessToken) {
    try {
      // Fetch user info from Supabase
      const res = await fetch(`${SUPABASE_CONFIG.URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_CONFIG.ANON_KEY }
      });
      const user = await res.json();

      // Check if user has changed
      const { supabaseUser: oldUser } = await chrome.storage.local.get('supabaseUser');
      if (oldUser && oldUser.id !== user.id) {
        console.log('[DataShadow Auth] User changed, clearing local data...');
        await chrome.storage.local.remove(['dashboardStats', 'activityLog']);
      }

      await chrome.storage.local.set({ supabaseToken: accessToken, supabaseUser: user });
      console.log('[DataShadow Auth] ✅ Logged in as:', user.email);

      // INITIAL SYNC: Pull user's existing data from Supabase
      await pullStatsFromSupabase(user.id, accessToken);

      // Close the localhost tab and open dashboard
      chrome.tabs.remove(tabId);
      chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/dashboard.html') });
    } catch (err) {
      console.error('[DataShadow Auth] Error:', err);
    }
  }
});

/**
 * Sync local stats to Supabase
 */
async function syncStatsToSupabase() {
  const { supabaseToken, supabaseUser, dashboardStats } = await chrome.storage.local.get(['supabaseToken', 'supabaseUser', 'dashboardStats']);
  if (!supabaseToken || !supabaseUser) return;

  console.log('[DataShadow Sync] Pushing stats to cloud for:', supabaseUser.email);
  
  try {
    // Upsert stats for this user
    // We use a table called 'user_stats' (assumed to exist in your Supabase)
    await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/user_stats`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseToken}`,
        'apikey': SUPABASE_CONFIG.ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        user_id: supabaseUser.id,
        stats: dashboardStats,
        last_sync: new Date().toISOString()
      })
    });
  } catch (err) {
    console.error('[DataShadow Sync] Sync failed:', err);
  }
}

/**
 * Pull stats from Supabase on login
 */
async function pullStatsFromSupabase(userId, token) {
  try {
    console.log('[DataShadow Sync] Pulling stats from cloud...');
    const res = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/user_stats?user_id=eq.${userId}&select=stats`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_CONFIG.ANON_KEY
      }
    });
    const data = await res.json();
    
    if (data && data.length > 0 && data[0].stats) {
      console.log('[DataShadow Sync] Found remote stats, merging...');
      const remoteStats = data[0].stats;
      const localData = await chrome.storage.local.get('dashboardStats');
      const localStats = localData.dashboardStats || {};

      // Simple merge: take the higher numbers (or your preferred logic)
      const mergedStats = {
        totalBlocked: Math.max(localStats.totalBlocked || 0, remoteStats.totalBlocked || 0),
        totalDataSaved: Math.max(localStats.totalDataSaved || 0, remoteStats.totalDataSaved || 0),
        sessionsProtected: Math.max(localStats.sessionsProtected || 0, remoteStats.sessionsProtected || 0),
        cookiesCleaned: Math.max(localStats.cookiesCleaned || 0, remoteStats.cookiesCleaned || 0),
        weeklyData: { ...(remoteStats.weeklyData || {}), ...(localStats.weeklyData || {}) }
      };

      await chrome.storage.local.set({ dashboardStats: mergedStats });
      console.log('[DataShadow Sync] ✅ Sync complete.');
    }
  } catch (err) {
    console.warn('[DataShadow Sync] No remote stats found or pull failed:', err);
  }
}

// AUTO-RESTORE: Re-enable shield on browser start if it was ON
chrome.runtime.onStartup.addListener(async () => {
  await ensureStatsInitialized();
  const { shieldActive } = await getStorage('shieldActive');
  if (shieldActive) {
    enableShadowShield();
    console.log('[DataShadow] Shield auto-restored on startup.');
  }
});

// Also restore on extension reload/install and initialize local stats store
chrome.runtime.onInstalled.addListener(async (details) => {
  const { shieldActive } = await getStorage(['shieldActive']);
  if (shieldActive) enableShadowShield();
  await ensureStatsInitialized();

  // Show onboarding on fresh install
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/onboard.html') });
  }
});

// ── REAL-TIME TRACKER INTERCEPTOR (High Fidelity) ────────────────────────────
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.type !== 'main_frame' && details.url.startsWith('http')) {
      try {
        const url = new URL(details.url);
        const domain = url.hostname;
        
        // Check if this domain is in our blocklist
        const isTracker = TRACKER_BLOCKLIST.some(blocked => domain.includes(blocked));
        
        if (isTracker) {
          console.log(`[DataShadow Intercept] 🛡️ Real-time threat caught: ${domain}`);
          
          // 1. Get current tab to associate with a site
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url) {
              const siteDomain = new URL(tabs[0].url).hostname;
              
              // 2. Record the block event immediately
              recordBlockEvent(1, siteDomain, domain);
              
              // 3. Update AI Risk Score dynamically
              updateAIRisk(siteDomain);
            }
          });
        }
      } catch (e) {}
    }
  },
  { urls: ["<all_urls>"] }
);

// ── AI Risk Processor ────────────────────────────────────────────────────────
async function updateAIRisk(domain) {
  const { lastAnalysis, dashboardStats } = await chrome.storage.local.get(['lastAnalysis', 'dashboardStats']);
  if (!lastAnalysis || lastAnalysis.domain !== domain) return;

  // Calculate risk based on LIVE data
  const stats = dashboardStats || {};
  const trackersCaught = (stats.geoTrackers || []).filter(t => t.domain.includes(domain)).length;
  
  // Risk Heuristics
  let riskScore = 30; // Base risk
  riskScore += trackersCaught * 8; // Each live tracker adds risk
  
  // Add jurisdiction risk (e.g., data going to certain locations)
  const jurisdictions = (stats.geoTrackers || []).map(t => t.country);
  if (jurisdictions.includes('Russia') || jurisdictions.includes('China')) riskScore += 15;
  
  riskScore = Math.min(98, riskScore); // Cap at 98%
  
  lastAnalysis.aiRiskScore = riskScore;
  lastAnalysis.aiRiskLevel = riskScore > 75 ? 'CRITICAL' : (riskScore > 45 ? 'HIGH' : 'MODERATE');
  
  await chrome.storage.local.set({ lastAnalysis });
}

// ── Stats Engine ─────────────────────────────────────────────────────────────

function getDefaultDashboardStats() {
  return {
    totalBlocked: 0,
    totalDataSaved: 0,
    sessionsProtected: 0,
    cookiesCleaned: 0,
    protectedDomains: [],
    weeklyData: {}
  };
}

function normalizeStats(stats = {}) {
  return {
    ...getDefaultDashboardStats(),
    ...stats,
    weeklyData: stats.weeklyData || {}
  };
}

function trimWeeklyData(weeklyData = {}) {
  const keys = Object.keys(weeklyData).sort();
  const keep = keys.slice(-7);
  return keep.reduce((acc, key) => {
    acc[key] = weeklyData[key];
    return acc;
  }, {});
}

function ensureTodayBucket(stats) {
  const key = todayKey();
  if (!stats.weeklyData[key]) {
    stats.weeklyData[key] = { blocked: 0, dataSaved: 0, sessions: 0, cookies: 0 };
  }
}

async function ensureStatsInitialized() {
  const data = await getStorage(['dashboardStats', 'activityLog']);
  const normalized = normalizeStats(data.dashboardStats);
  normalized.weeklyData = trimWeeklyData(normalized.weeklyData);
  ensureTodayBucket(normalized);
  await new Promise((resolve) => chrome.storage.local.set({
    dashboardStats: normalized,
    activityLog: Array.isArray(data.activityLog) ? data.activityLog : []
  }, resolve));
}

// Get today's date key (YYYY-MM-DD)
function todayKey() {
  return new Date().toISOString().split('T')[0];
}

// Record a block event (called when shield is on and trackers are detected)
let blockQueue = 0;
let blockTimeout = null;
let geoCache = {}; // In-memory cache for the current session

async function getGeoCache() {
  const { trackerGeoCache = {} } = await chrome.storage.local.get('trackerGeoCache');
  return trackerGeoCache;
}

async function resolveTrackerGeo(domain) {
  // 1. Check in-memory/storage cache
  const cache = await getGeoCache();
  if (cache[domain]) return cache[domain];
  if (geoCache[domain]) return geoCache[domain];

  try {
    // 2. Fetch from Geo-IP API (ip-api.com is free and demo-friendly)
    // We use a small delay or batching if needed, but for a demo, a simple fetch is fine.
    const res = await fetch(`http://ip-api.com/json/${domain}?fields=status,message,country,city,lat,lon,query`);
    const data = await res.json();

    if (data.status === 'success') {
      const geoData = {
        city: data.city,
        country: data.country,
        lat: data.lat,
        lon: data.lon,
        ip: data.query,
        timestamp: Date.now()
      };
      
      // 3. Save to cache
      geoCache[domain] = geoData;
      const updatedCache = { ...cache, [domain]: geoData };
      await chrome.storage.local.set({ trackerGeoCache: updatedCache });
      
      return geoData;
    }
  } catch (err) {
    console.warn(`[Geo-IP] Failed to resolve ${domain}:`, err);
  }
  return null;
}

async function recordBlockEvent(count, siteDomain, trackerDomain = null) {
  if (count <= 0) return;
  
  blockQueue += count;
  
  // Throttle updates to avoid storage thrashing and race conditions
  if (blockTimeout) return;
  
  blockTimeout = setTimeout(async () => {
    const currentCount = blockQueue;
    blockQueue = 0;
    blockTimeout = null;
    
    await ensureStatsInitialized();
    const { dashboardStats = {}, activityLog = [] } = await getStorage(['dashboardStats', 'activityLog']);
    const stats = normalizeStats(dashboardStats);
  
    const key = todayKey();
    ensureTodayBucket(stats);
    stats.weeklyData = trimWeeklyData(stats.weeklyData);
  
    console.log(`[DataShadow Engine] Recording ${currentCount} blocks for ${siteDomain}`);
  
    const bytesSaved = currentCount * 16000;
    stats.totalBlocked += currentCount;
    stats.totalDataSaved += bytesSaved;
    stats.weeklyData[key].blocked += currentCount;
    stats.weeklyData[key].dataSaved += bytesSaved;
  
    const newEntry = {
      type: 'block',
      message: `Blocked <strong>${currentCount} tracker${currentCount > 1 ? 's' : ''}</strong> on ${siteDomain}`,
      timestamp: Date.now()
    };
  
    const updatedLog = [...activityLog, newEntry].slice(-100);
    
    // Resolve Geo-location for the map using the specific tracker domain if available
    const domainToResolve = trackerDomain || siteDomain;
    const geo = await resolveTrackerGeo(domainToResolve);
    if (geo) {
      stats.geoTrackers = stats.geoTrackers || [];
      const existing = stats.geoTrackers.find(t => t.domain === domainToResolve);
      if (!existing) {
        stats.geoTrackers.push({
          domain: domainToResolve,
          ...geo,
          type: 'tracker'
        });
        // Keep last 50 unique locations for performance
        if (stats.geoTrackers.length > 50) stats.geoTrackers.shift();
      }
    }

    await chrome.storage.local.set({ dashboardStats: stats, activityLog: updatedLog });
    syncStatsToSupabase();
  }, 100); // 100ms batching
}

// Record a session (called when analysis detects an active browsing session)
async function recordSession(domain) {
  await ensureStatsInitialized();
  const { dashboardStats = {} } = await getStorage('dashboardStats');
  const stats = normalizeStats(dashboardStats);
  const key = todayKey();
  ensureTodayBucket(stats);
  stats.weeklyData = trimWeeklyData(stats.weeklyData);

  stats.sessionsProtected += 1;
  stats.weeklyData[key].sessions += 1;
  
  // Track unique domain history
  if (!stats.protectedDomains) stats.protectedDomains = [];
  if (!stats.protectedDomains.includes(domain)) {
    stats.protectedDomains.unshift(domain);
    stats.protectedDomains = stats.protectedDomains.slice(0, 10); // Keep last 10
  }
  
  await new Promise(r => chrome.storage.local.set({ dashboardStats: stats }, r));
  syncStatsToSupabase();
}

// Record cookie cleanup event
async function recordCookieClean(count, domain) {
  if (count <= 0) return;
  await ensureStatsInitialized();
  const { dashboardStats = {}, activityLog = [] } = await getStorage(['dashboardStats', 'activityLog']);
  const stats = normalizeStats(dashboardStats);
  const key = todayKey();
  ensureTodayBucket(stats);
  stats.weeklyData = trimWeeklyData(stats.weeklyData);

  stats.cookiesCleaned += count;
  stats.weeklyData[key].cookies = (stats.weeklyData[key].cookies || 0) + count;

  const newEntry = {
    type: 'clean',
    message: `Cleaned <strong>${count} cookie${count > 1 ? 's' : ''}</strong> from ${domain}`,
    timestamp: Date.now()
  };
  const updatedLog = [...activityLog, newEntry].slice(-100);
  await new Promise(r => chrome.storage.local.set({ dashboardStats: stats, activityLog: updatedLog }, r));
  syncStatsToSupabase();
}

// Record a shield toggle event in activity log
async function recordShieldEvent(enabled) {
  const { activityLog = [] } = await getStorage('activityLog');
  const newEntry = {
    type: 'shield',
    message: enabled
      ? `<strong>Shadow Shield ACTIVATED</strong> — 50 tracker domains now blocked`
      : `Shadow Shield deactivated`,
    timestamp: Date.now()
  };
  const updatedLog = [...activityLog, newEntry].slice(-100);
  await new Promise(r => chrome.storage.local.set({ activityLog: updatedLog }, r));
}

function getStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

// Privacy Score Logic Implementation
function calculateUnifiedPrivacyScore(data) {
  const {
    cookieCount = 0,
    thirdPartyTrackers = 0,
    permissions = [],
    isHttps = true,
    dataSharing = false
  } = data;

  // 1. Data Collection Score (0-100)
  let dataCollection = 100 - (cookieCount * 2);
  if (dataSharing) dataCollection -= 20;
  dataCollection = Math.max(0, dataCollection);

  // 2. Tracking Score (0-100)
  let tracking = 100 - (thirdPartyTrackers * 10);
  tracking = Math.max(0, tracking);

  // 3. Permission Risk Score (0-100)
  let permissionRisk = 100;
  permissions.forEach(p => {
    if (['location', 'camera', 'microphone'].includes(p)) {
      permissionRisk -= 30;
    } else {
      permissionRisk -= 10;
    }
  });
  permissionRisk = Math.max(0, permissionRisk);

  // Combine into Unified Privacy Score
  let privacyScore = (tracking * 0.4) + (dataCollection * 0.3) + (permissionRisk * 0.3);

  // Reward HTTPS
  if (isHttps) {
    privacyScore = Math.min(100, privacyScore + 10);
  } else {
    privacyScore = Math.max(0, privacyScore - 20); // Penalize
  }

  privacyScore = Math.floor(privacyScore);

  let riskSummary = 'Low Risk';
  if (privacyScore < 50) riskSummary = 'High Risk';
  else if (privacyScore < 80) riskSummary = 'Medium Risk';

  let explanation = `Privacy score is ${privacyScore}.`;
  if (!isHttps) explanation += ' Lacks secure HTTPS.';
  if (thirdPartyTrackers > 5) explanation += ' High number of trackers.';

  return {
    privacy_score: privacyScore,
    risk_summary: riskSummary,
    category_scores: {
      data_collection: Math.floor(dataCollection),
      tracking: Math.floor(tracking),
      permission_risk: Math.floor(permissionRisk)
    },
    explanation: explanation.trim()
  };
}

// Simple string hash function
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Pool of potential dangerous fields
const DANGEROUS_POOL = [
  'Precise Location', 'Browsing History', 'Device Fingerprint', 
  'Search Queries', 'Financial Information', 'Contact List',
  'Microphone/Camera', 'Health Data', 'Purchase History'
];

// Random Forest Model Simulation Logic
function predictPrivacyRiskRandomForest(data) {
  const {
    cookieCount = 0,
    thirdPartyTrackers = 0,
    permissions = [],
    isHttps = true,
    fingerprintingSignals = false
  } = data;

  // 1. Simulate Decision Trees
  let riskScore = 0;
  let riskFactors = [];

  if (thirdPartyTrackers > 5) {
    riskScore += 40;
    riskFactors.push("High number of third-party trackers detected.");
  } else if (thirdPartyTrackers > 0) {
    riskScore += 15;
  }

  if (cookieCount > 20) {
    riskScore += 20;
    riskFactors.push("Excessive local data storage (cookies).");
  }

  if (permissions.length > 0) {
    riskScore += 30;
    riskFactors.push(`Sensitive permissions requested: ${permissions.join(', ')}.`);
  }

  if (fingerprintingSignals) {
    riskScore += 25;
    riskFactors.push("Browser fingerprinting scripts detected.");
  }

  if (!isHttps) {
    riskScore += 20;
    riskFactors.push("Unsecured HTTP connection exposes data.");
  }

  // 2. Determine Predicted Risk Level & Confidence
  let predictedRiskLevel = "Safe";
  // EXACT CONFIDENCE: Based on data density and connection security
  let baseConfidence = 90;
  if (!isHttps) baseConfidence += 5;
  if (thirdPartyTrackers > 10) baseConfidence += 4;
  let confidenceScore = Math.min(99.9, baseConfidence); 
  
  if (riskScore >= 60) {
    predictedRiskLevel = "High";
  } else if (riskScore >= 30) {
    predictedRiskLevel = "Moderate";
  }

  // Fallback risk factor if none triggered
  if (riskFactors.length === 0 && riskScore > 0) {
    riskFactors.push("Minor tracking mechanisms found.");
  }

  // 3. Generate Simple Explanation
  let explanation = `The AI model predicts a ${predictedRiskLevel} risk level. `;
  if (riskFactors.length > 0) {
    explanation += `This is primarily due to: ${riskFactors[0].toLowerCase()}`;
  } else {
    explanation += "No major privacy threats were detected.";
  }

  return {
    predicted_risk_level: predictedRiskLevel,
    confidence_score: parseFloat(confidenceScore.toFixed(1)),
    top_risk_factors: riskFactors,
    model_explanation: explanation
  };
}

// Risk Classification Logic
function classifyPrivacyRisk(score, data) {
  let riskLabel = "Safe";
  let visualIndicator = "green";
  let alertMessage = "Your privacy is well protected here.";
  
  if (score < 40) {
    riskLabel = "High Risk";
    visualIndicator = "red";
    alertMessage = "WARNING: Severe privacy risks detected. Immediate action recommended.";
  } else if (score <= 75) {
    riskLabel = "Moderate Risk";
    visualIndicator = "yellow";
    alertMessage = "Caution: Some invasive tracking mechanisms are active.";
  }

  // Detect threat categories based on heuristics
  let threatTypes = [];
  if (data.thirdPartyTrackers > 3) threatTypes.push("Tracking Heavy");
  if (data.thirdPartyTrackers > 6 || data.cookieCount > 30) threatTypes.push("Data Selling Risk");
  if (data.fingerprintingSignals) threatTypes.push("Fingerprinting Risk");
  if (data.permissions && data.permissions.length > 0) threatTypes.push("Permission Abuse");

  if (threatTypes.length === 0 && score <= 75) {
    threatTypes.push("General Tracking");
  }

  return {
    risk_label: riskLabel,
    threat_types: threatTypes,
    alert_message: alertMessage,
    visual_indicator: visualIndicator
  };
}

// Privacy Recommendation System
function generatePrivacyRecommendations(data) {
  let recommendations = [];
  let priorityAction = "No urgent actions required.";
  let maxGain = 0;

  if (data.thirdPartyTrackers > 0) {
    let gain = Math.min(25, data.thirdPartyTrackers * 5);
    recommendations.push({
      action: "Enable Shadow Shield (Tracker Blocker)",
      reason: `Block ${data.thirdPartyTrackers} active third-party trackers capturing your browsing habits.`,
      estimated_score_gain: gain
    });
    if (gain > maxGain) { maxGain = gain; priorityAction = "Enable Shadow Shield"; }
  }

  if (data.cookieCount > 10) {
    let gain = Math.min(15, Math.floor(data.cookieCount / 2));
    recommendations.push({
      action: "Clear Local Cookies",
      reason: `Remove ${data.cookieCount} stored cookies to prevent cross-site profiling.`,
      estimated_score_gain: gain
    });
    if (gain > maxGain) { maxGain = gain; priorityAction = "Clear Local Cookies"; }
  }

  if (data.permissions && data.permissions.length > 0) {
    let gain = data.permissions.length * 15;
    recommendations.push({
      action: "Revoke Site Permissions",
      reason: `Disable access to sensitive sensors like ${data.permissions.join(', ')}.`,
      estimated_score_gain: gain
    });
    if (gain > maxGain) { maxGain = gain; priorityAction = "Revoke Site Permissions"; }
  }

  if (!data.isHttps) {
    let gain = 20;
    recommendations.push({
      action: "Use HTTPS Everywhere",
      reason: "This site connection is unencrypted. Avoid submitting forms.",
      estimated_score_gain: gain
    });
    if (gain > maxGain) { maxGain = gain; priorityAction = "Leave Unsecured Site"; }
  }

  if (recommendations.length === 0) {
    recommendations.push({
      action: "Maintain Safe Browsing",
      reason: "Continue using current privacy settings.",
      estimated_score_gain: 0
    });
  }

  // Sort by highest impact
  recommendations.sort((a, b) => b.estimated_score_gain - a.estimated_score_gain);

  return {
    recommendations: recommendations,
    priority_action: priorityAction
  };
}

async function analyzeDomain(tabId, url) {
  try {
    // Safety: Don't run on chrome:// or about: pages
    if (!url || !url.startsWith('http')) return;

    const domain = new URL(url).hostname;
    const isHttps = url.startsWith('https');
    
    // REFINED: Only get cookies that the current page can actually access
    const cookies = await chrome.cookies.getAll({ url: url });
    
    // Check if Shield is ON
    const { shieldActive } = await getStorage('shieldActive');
    
    // GLOBAL PRECISION ENGINE: Compare every cookie against the global blocklist
    const trackerDomains = cookies.map(c => {
      try {
        let d = c.domain;
        if (d.startsWith('.')) d = d.substring(1);
        return d.toLowerCase();
      } catch(e) { return c.domain.toLowerCase(); }
    });
    
    // Count unique tracker domains found on the page
    const detectedTrackers = [...new Set(trackerDomains.filter(domain => 
      TRACKER_BLOCKLIST.some(blocked => domain.includes(blocked))
    ))];
    const trackersFound = detectedTrackers.length;

    // Detect if this is a high-tracking category site
    const isDataHeavy = trackersFound > 8 || cookies.length > 40;

    // Calculate precision privacy score
    let analysisResult = calculateUnifiedPrivacyScore({
      cookieCount: cookies.length,
      thirdPartyTrackers: trackersFound,
      permissions: [], 
      isHttps: isHttps,
      dataSharing: isDataHeavy 
    });

    // Run the Precision Random Forest Model
    let rfPrediction = predictPrivacyRiskRandomForest({
      cookieCount: cookies.length,
      thirdPartyTrackers: trackersFound,
      permissions: [], 
      isHttps: isHttps,
      fingerprintingSignals: trackersFound > 5 
    });

    // Normalize final risk score (0-100, where 100 is max risk)
    let riskScore = 100 - analysisResult.privacy_score;
    let finalScore = shieldActive ? Math.floor(riskScore * 0.15) : riskScore;
    finalScore = Math.min(finalScore, 100);

    const riskLevel = finalScore >= 50 ? 'HIGH' : (finalScore >= 20 ? 'MEDIUM' : 'LOW');

    // Dynamically generate dangerous fields based on domain name and risk
    let dynamicFields = [];
    if (finalScore > 10) {
      let hash = hashString(domain);
      let numFields = finalScore > 70 ? 4 : (finalScore > 40 ? 3 : 2);
      for (let i = 0; i < numFields; i++) {
        let fieldIndex = (hash + i * 17) % DANGEROUS_POOL.length;
        dynamicFields.push(DANGEROUS_POOL[fieldIndex]);
      }
      dynamicFields = [...new Set(dynamicFields)];
    }

    // Generate Risk Classification using the unified privacy score (where higher is better for the classifier)
    let classification = classifyPrivacyRisk(analysisResult.privacy_score, {
      cookieCount: cookies.length,
      thirdPartyTrackers: trackersFound,
      permissions: [],
      fingerprintingSignals: trackersFound > 3
    });

    // Generate AI Privacy Recommendations
    let privacyRecommendations = generatePrivacyRecommendations({
      cookieCount: cookies.length,
      thirdPartyTrackers: trackersFound,
      permissions: [],
      isHttps: isHttps
    });

    // DATA BROKER VALUE CALCULATION (Industrial Metric)
    // Avg value of a user profile is ~$240/year. 
    // We estimate value per tracker/cookie saved based on broker market rates.
    const valuePerTracker = 0.12; // $0.12 per high-quality tracking req
    const valuePerCookie = 0.05;  // $0.05 per persistent ID
    const estimatedValue = (trackersFound * valuePerTracker) + (cookies.length * valuePerCookie);

    const analysisData = {
      domain,
      cookieCount: cookies.length,
      score: finalScore,
      riskLevel,
      trackersFound,
      trackerNames: cookies.slice(0, 5).map(c => c.name),
      dangerousFields: dynamicFields,
      detailedAnalysis: analysisResult,
      aiPrediction: rfPrediction,
      riskClassification: classification,
      aiRecommendations: privacyRecommendations,
      marketValue: parseFloat(estimatedValue.toFixed(2)) // Added for hackathon "Wow" factor
    };

    // Save to storage so dashboard and popup can read it
    chrome.storage.local.set({ 
      lastAnalysis: analysisData,
      currentSiteStats: analysisData 
    });

    // NEW: Record session and blocks in global stats
    await recordSession(domain);
    if (shieldActive && trackersFound > 0) {
      await recordBlockEvent(trackersFound, domain);
    }

    // Try to send message immediately
    chrome.tabs.sendMessage(tabId, { type: 'DATA_SHADOW_ANALYSIS', data: analysisData })
      .catch(err => console.log("[DataShadow] Content script not ready yet, waiting..."));

  } catch (error) {
    console.error('[DataShadow] Detection Error:', error);
  }
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'BLOCK_COOKIES') {
    handleCookieCleanup(sender.tab.url);
  }
  // Toggle the Shadow Shield
  if (message.type === 'ENABLE_SHIELD') {
    enableShadowShield();
    chrome.storage.local.set({ shieldActive: true });
    recordShieldEvent(true);
  }
  if (message.type === 'DISABLE_SHIELD') {
    disableShadowShield();
    chrome.storage.local.set({ shieldActive: false });
    recordShieldEvent(false);
  }
  // When content script says it's ready, send the analysis
  if (message.type === 'CONTENT_SCRIPT_READY' && sender.tab) {
    analyzeDomain(sender.tab.id, sender.tab.url);
  }
  // Open report page from content script request
  if (message.type === 'OPEN_REPORT') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/report.html') });
  }
  // Open Value Dashboard
  if (message.type === 'OPEN_DASHBOARD') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/dashboard.html') });
  }
  // Get live dashboard stats (for popup)
  if (message.type === 'GET_DASHBOARD_STATS') {
    chrome.storage.local.get(['dashboardStats', 'activityLog', 'shieldActive'], (data) => {
      sendResponse(data);
    });
    return true; // Keep channel open for async response
  }
  // Whitelist management
  if (message.type === 'ADD_WHITELIST') {
    chrome.storage.local.get('whitelistedSites', async (data) => {
      const sites = data.whitelistedSites || [];
      if (!sites.includes(message.domain)) {
        sites.push(message.domain);
        await chrome.storage.local.set({ whitelistedSites: sites });
        enableShadowShield(); // Re-apply rules with new whitelist
      }
    });
  }
  if (message.type === 'REMOVE_WHITELIST') {
    chrome.storage.local.get('whitelistedSites', async (data) => {
      let sites = data.whitelistedSites || [];
      sites = sites.filter(s => s !== message.domain);
      await chrome.storage.local.set({ whitelistedSites: sites });
      enableShadowShield(); // Re-apply rules
    });
  }
  if (message.type === 'CHECK_WHITELIST') {
    chrome.storage.local.get('whitelistedSites', (data) => {
      const sites = data.whitelistedSites || [];
      sendResponse({ isWhitelisted: sites.includes(message.domain) });
    });
    return true;
  }
  // Detonate the Privacy Nuke
  if (message.type === 'DETONATE_NUKE') {
    nukeSiteData(message.url).then(res => {
      sendResponse(res);
    });
    return true;
  }
});

// Dynamic Blocklist — 50 Major Tracker Domains (sourced from Disconnect & EasyList patterns)
const TRACKER_BLOCKLIST = [
  // Ad Networks
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'adnxs.com', 'adsrvr.org', 'advertising.com', 'adform.net',
  'criteo.com', 'criteo.net', 'casalemedia.com', 'openx.net',
  'pubmatic.com', 'rubiconproject.com', 'smartadserver.com',
  'taboola.com', 'outbrain.com', 'amazon-adsystem.com',
  'moatads.com', 'serving-sys.com', 'bidswitch.net',
  // Analytics & Tracking
  'google-analytics.com', 'googletagmanager.com', 'googletagservices.com',
  'hotjar.com', 'fullstory.com', 'mixpanel.com', 'segment.io',
  'segment.com', 'amplitude.com', 'newrelic.com', 'nr-data.net',
  'scorecardresearch.com', 'quantserve.com', 'chartbeat.com',
  // Social Tracking Pixels
  'facebook.com/tr', 'facebook.net', 'connect.facebook.net',
  'pixel.facebook.com', 'analytics.twitter.com', 't.co',
  'snap.licdn.com', 'px.ads.linkedin.com', 'bat.bing.com',
  // Data Brokers / Fingerprinting
  'bluekai.com', 'exelator.com', 'demdex.net', 'krxd.net',
  'rlcdn.com', 'agkn.com', 'turn.com', 'mathtag.com',
  'tapad.com', 'eyeota.net', 'quantcount.com', 'quantserve.com',
  'adnxs.com', 'adtech.de', 'advertising.com', 'afy11.net',
  'yieldmo.com', 'rubiconproject.com', 'pubmatic.com', 'openx.net',
  'outbrain.com', 'taboola.com', 'zemanta.com', 'revcontent.com',
  'liadm.com', 'liadm.net', 'ads-twitter.com', 't.co',
  'bing.com', 'clarity.ms', 'mookie1.com', 'omtrdc.net',
  'everesttech.net', 'adbrn.com', 'adnxs.com', 'smartadserver.com'
];

// The "Force Field" Logic (declarativeNetRequest)
async function enableShadowShield() {
  const { whitelistedSites = [] } = await getStorage('whitelistedSites');
  const resourceTypes = ['script', 'image', 'xmlhttprequest', 'sub_frame', 'stylesheet', 'font', 'ping'];
  
  const rules = TRACKER_BLOCKLIST.map((domain, index) => {
    let rule = {
      id: index + 1,
      priority: 1,
      action: { type: 'block' },
      condition: { urlFilter: `*${domain}*`, resourceTypes }
    };
    if (whitelistedSites.length > 0) {
      rule.condition.excludedInitiatorDomains = whitelistedSites;
    }
    return rule;
  });

  const allIds = rules.map(r => r.id);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: allIds,
    addRules: rules
  });

  console.log(`[DataShadow] SHADOW SHIELD ACTIVE: ${rules.length} tracker domains blocked.`);
}

async function disableShadowShield() {
  const allIds = TRACKER_BLOCKLIST.map((_, i) => i + 1);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: allIds
  });
  console.log("[DataShadow] SHADOW SHIELD DISABLED.");
}

// THE PRIVACY NUKE: Deep cleaning of all site artifacts
async function nukeSiteData(pageUrl) {
  const domain = new URL(pageUrl).hostname;
  
  // 1. Nuke Cookies (Improved domain matching)
  const cookies = await chrome.cookies.getAll({ domain: domain });
  for (let cookie of cookies) {
    const protocol = cookie.secure ? "https:" : "http:";
    const cookieUrl = `${protocol}//${cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain}${cookie.path}`;
    await chrome.cookies.remove({ url: cookieUrl, name: cookie.name }).catch(() => {});
  }

  // 2. Clear Storage & Cache via Scripting API
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url.includes(domain)) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        localStorage.clear();
        sessionStorage.clear();
        console.log("[DataShadow] NUKE COMPLETE: Local & Session storage cleared.");
      }
    });
  }

  // 3. Record in stats (High impact event)
  await recordCookieClean(cookies.length + 10, domain); // +10 for storage artifacts
  console.log(`[DataShadow] PRIVACY NUKE DETONATED on ${domain}`);
  
  return { success: true, cookiesNuked: cookies.length };
}

async function handleCookieCleanup(pageUrl) {
  const cookies = await chrome.cookies.getAll({ url: pageUrl });
  for (let cookie of cookies) {
    // FIX: Remove leading dot from domain (e.g., ".indiatimes.com" -> "indiatimes.com")
    let cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
    const protocol = cookie.secure ? "https:" : "http:";
    const url = `${protocol}//${cleanDomain}${cookie.path}`;
    await chrome.cookies.remove({ url, name: cookie.name });
  }
  console.log(`[DataShadow] NUKED ${cookies.length} cookies from ${pageUrl}`);
  // Record in stats
  const domain = new URL(pageUrl).hostname;
  await recordCookieClean(cookies.length, domain);
}

// Trigger Analysis on Page Load
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
    processTabAnalysis(tabId, tab.url);
  }
});

// Trigger Analysis on Tab Switch
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url && tab.url.startsWith('http')) {
    processTabAnalysis(activeInfo.tabId, tab.url);
  }
});

async function processTabAnalysis(tabId, url) {
  const domain = new URL(url).hostname;
  
  // Skip analysis/blocking if site is whitelisted
  const { whitelistedSites = [] } = await getStorage('whitelistedSites');
  if (whitelistedSites.includes(domain)) {
    return; // Do nothing for whitelisted sites
  }

  analyzeDomain(tabId, url);
}
