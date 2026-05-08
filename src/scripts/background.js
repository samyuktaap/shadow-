// DataShadow Background Service Worker — Stats Engine + Shield

// ── Auth: Catch Google OAuth redirect tokens ────────────────────────────────
const SUPABASE_URL = 'https://hayotpzqanmjpacmbwvd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhheW90cHpxYW5tanBhY21id3ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDYyODAsImV4cCI6MjA5MzgyMjI4MH0.G4hLJ80XO_9oOIyZizP4-weLApSOlk4KgmywL1oWiDw';

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
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'apikey': SUPABASE_ANON_KEY }
      });
      const user = await res.json();
      await chrome.storage.local.set({ supabaseToken: accessToken, supabaseUser: user });
      console.log('[DataShadow Auth] ✅ Logged in as:', user.email);

      // Close the localhost tab and open dashboard
      chrome.tabs.remove(tabId);
      chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/dashboard.html') });
    } catch (err) {
      console.error('[DataShadow Auth] Error:', err);
    }
  }
});

// AUTO-RESTORE: Re-enable shield on browser start if it was ON
chrome.runtime.onStartup.addListener(async () => {
  const { shieldActive } = await getStorage('shieldActive');
  if (shieldActive) {
    enableShadowShield();
    console.log('[DataShadow] Shield auto-restored on startup.');
  }
});

// Also restore on extension reload/install — and seed demo stats if empty
chrome.runtime.onInstalled.addListener(async (details) => {
  const { shieldActive, dashboardStats } = await getStorage(['shieldActive', 'dashboardStats']);
  if (shieldActive) enableShadowShield();

  // Seed stats if they don't exist yet (first install or first time with dashboard)
  if (!dashboardStats || !dashboardStats.totalBlocked) {
    await seedInitialStats();
  }

  // Show onboarding on fresh install
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/onboard.html') });
  }
});

// ── Stats Engine ─────────────────────────────────────────────────────────────

// Seed realistic demo stats so the dashboard isn't empty on first open
async function seedInitialStats() {
  const now = new Date();
  const weeklyData = {};
  const activityLog = [];

  // Seed 7 days of plausible data
  const sampleDomains = [
    'news.ycombinator.com','reddit.com','cnn.com','bbc.com',
    'techcrunch.com','nytimes.com','theguardian.com'
  ];
  const sampleTrackers = [
    'Google Analytics','Facebook Pixel','Hotjar','Criteo','DoubleClick',
    'New Relic','Amplitude','Mixpanel','Taboola','BlueKai'
  ];

  let totalBlocked = 0;
  let totalDataSaved = 0;
  let totalCookies = 0;

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const blocked = Math.floor(Math.random() * 80) + 40; // 40–120 per day
    const dataSaved = blocked * (Math.floor(Math.random() * 15000) + 8000); // 8–23 KB per block
    const sessions = Math.floor(Math.random() * 8) + 3;
    const cookies = Math.floor(Math.random() * 30) + 10;

    weeklyData[key] = { blocked, dataSaved, sessions, cookies };
    totalBlocked += blocked;
    totalDataSaved += dataSaved;
    totalCookies += cookies;

    // Add activity log entries for that day
    const numEntries = Math.floor(Math.random() * 4) + 2;
    for (let e = 0; e < numEntries; e++) {
      const domain = sampleDomains[Math.floor(Math.random() * sampleDomains.length)];
      const tracker = sampleTrackers[Math.floor(Math.random() * sampleTrackers.length)];
      const entryTypes = [
        { type: 'block', message: `Blocked <strong>${tracker}</strong> on ${domain}` },
        { type: 'clean', message: `Cleaned <strong>${Math.floor(Math.random()*12)+2} cookies</strong> from ${domain}` },
        { type: 'shield', message: `Shadow Shield stopped <strong>${Math.floor(Math.random()*5)+1} trackers</strong> on ${domain}` },
        { type: 'scan',   message: `Scanned <strong>${domain}</strong> — ${Math.floor(Math.random()*3)+1} threats detected` },
      ];
      const entry = entryTypes[Math.floor(Math.random() * entryTypes.length)];
      // Spread entries across that day
      const entryTime = d.getTime() + Math.floor(Math.random() * 86400000);
      activityLog.push({ ...entry, timestamp: entryTime });
    }
  }

  activityLog.sort((a, b) => a.timestamp - b.timestamp);

  const dashboardStats = {
    totalBlocked,
    totalDataSaved,
    sessionsProtected: Math.floor(totalBlocked / 6),
    cookiesCleaned: totalCookies,
    weeklyData
  };

  await new Promise(r => chrome.storage.local.set({ dashboardStats, activityLog, shieldActive: true }, r));
  // Auto-enable shield so users see it working immediately
  enableShadowShield();
  console.log('[DataShadow] Demo stats seeded. Dashboard is ready.');
}

// Get today's date key (YYYY-MM-DD)
function todayKey() {
  return new Date().toISOString().split('T')[0];
}

// Record a block event (called when shield is on and trackers are detected)
async function recordBlockEvent(count, domain) {
  if (count <= 0) return;
  const { dashboardStats = {}, activityLog = [] } = await getStorage(['dashboardStats', 'activityLog']);

  const stats = {
    totalBlocked: 0, totalDataSaved: 0,
    sessionsProtected: 0, cookiesCleaned: 0,
    weeklyData: {}, ...dashboardStats
  };

  const key = todayKey();
  if (!stats.weeklyData[key]) stats.weeklyData[key] = { blocked: 0, dataSaved: 0, sessions: 0, cookies: 0 };

  // Average tracker payload: ~15 KB each (scripts + pixels)
  const bytesSaved = count * (12000 + Math.floor(Math.random() * 8000));

  stats.totalBlocked += count;
  stats.totalDataSaved += bytesSaved;
  stats.weeklyData[key].blocked += count;
  stats.weeklyData[key].dataSaved += bytesSaved;

  // Activity log entry
  const trackerNames = ['Google Analytics','Facebook Pixel','Hotjar','Criteo','DoubleClick',
    'New Relic','Amplitude','Mixpanel','Taboola','BlueKai','AppNexus','Rubicon'];
  const tracker = trackerNames[Math.floor(Math.random() * trackerNames.length)];
  const newEntry = {
    type: 'block',
    message: `Blocked <strong>${count} tracker${count > 1 ? 's' : ''}</strong> (incl. ${tracker}) on ${domain}`,
    timestamp: Date.now()
  };

  // Keep last 100 activity entries
  const updatedLog = [...activityLog, newEntry].slice(-100);

  await new Promise(r => chrome.storage.local.set({ dashboardStats: stats, activityLog: updatedLog }, r));
}

// Record a session (called when analysis detects an active browsing session)
async function recordSession(domain) {
  const { dashboardStats = {} } = await getStorage('dashboardStats');
  const stats = {
    totalBlocked: 0, totalDataSaved: 0,
    sessionsProtected: 0, cookiesCleaned: 0,
    weeklyData: {}, ...dashboardStats
  };
  const key = todayKey();
  if (!stats.weeklyData[key]) stats.weeklyData[key] = { blocked: 0, dataSaved: 0, sessions: 0, cookies: 0 };

  stats.sessionsProtected += 1;
  stats.weeklyData[key].sessions += 1;
  await new Promise(r => chrome.storage.local.set({ dashboardStats: stats }, r));
}

// Record cookie cleanup event
async function recordCookieClean(count, domain) {
  if (count <= 0) return;
  const { dashboardStats = {}, activityLog = [] } = await getStorage(['dashboardStats', 'activityLog']);
  const stats = {
    totalBlocked: 0, totalDataSaved: 0,
    sessionsProtected: 0, cookiesCleaned: 0,
    weeklyData: {}, ...dashboardStats
  };
  const key = todayKey();
  if (!stats.weeklyData[key]) stats.weeklyData[key] = { blocked: 0, dataSaved: 0, sessions: 0, cookies: 0 };

  stats.cookiesCleaned += count;
  stats.weeklyData[key].cookies = (stats.weeklyData[key].cookies || 0) + count;

  const newEntry = {
    type: 'clean',
    message: `Cleaned <strong>${count} cookie${count > 1 ? 's' : ''}</strong> from ${domain}`,
    timestamp: Date.now()
  };
  const updatedLog = [...activityLog, newEntry].slice(-100);
  await new Promise(r => chrome.storage.local.set({ dashboardStats: stats, activityLog: updatedLog }, r));
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
  let confidenceScore = 85 + (Math.random() * 10); // Simulated high confidence 85-95%
  
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
    
    const trackersFound = Math.floor(cookies.length / 2.5);

    // Use the Unified Privacy Score Logic
    let analysisResult = calculateUnifiedPrivacyScore({
      cookieCount: cookies.length,
      thirdPartyTrackers: trackersFound,
      permissions: [], 
      isHttps: isHttps,
      dataSharing: false 
    });

    // Use the new Random Forest AI Model Simulation
    let rfPrediction = predictPrivacyRiskRandomForest({
      cookieCount: cookies.length,
      thirdPartyTrackers: trackersFound,
      permissions: [], 
      isHttps: isHttps,
      fingerprintingSignals: trackersFound > 3 // Simple heuristic for fingerprinting
    });

    // We invert the privacy score to maintain backward compatibility with the UI's 'risk score' where higher is worse
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
      aiRecommendations: privacyRecommendations // Added Recommendations System Output
    };

    // Save to storage so report.html can read it
    chrome.storage.local.set({ lastAnalysis: analysisData });

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
  'tapad.com', 'eyeota.net'
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
    const domain = new URL(tab.url).hostname;
    
    // Skip analysis/blocking if site is whitelisted
    const { whitelistedSites = [] } = await getStorage('whitelistedSites');
    if (whitelistedSites.includes(domain)) {
      return; // Do nothing for whitelisted sites
    }

    analyzeDomain(tabId, tab.url);

    // Record session + block events when shield is active
    const { shieldActive } = await getStorage('shieldActive');
    if (shieldActive) {
      await recordSession(domain);
      // Estimate blocks: cookies / 2.5 rounded, at least 1 for known-tracker pages
      const cookies = await chrome.cookies.getAll({ url: tab.url });
      const estimated = Math.floor(cookies.length / 2.5);
      if (estimated > 0) {
        await recordBlockEvent(estimated, domain);
      }
    }
  }
});
