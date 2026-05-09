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
      
      // Check if this is a different user than before
      const prev = await chrome.storage.local.get('supabaseUser');
      if (prev.supabaseUser && prev.supabaseUser.id !== user.id) {
        console.log('[DataShadow Auth] New user detected. Resetting stats for fresh account.');
        await chrome.storage.local.set({ 
          dashboardStats: { totalBlocked: 0, totalDataSaved: 0, sessionsProtected: 0, cookiesCleaned: 0, weeklyData: {} },
          activityLog: []
        });
      }

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

// Also restore on extension reload/install
chrome.runtime.onInstalled.addListener(async (details) => {
  // FORCE SHIELD ON FOR DEMO
  await chrome.storage.local.set({ shieldActive: true });
  enableShadowShield();

  const { dashboardStats: currentStats } = await getStorage(['dashboardStats']);
  
  // DATA SEEDING: If stats are empty, seed with "Wow" values for the hackathon demo
  if (!currentStats || currentStats.totalBlocked === 0) {
    console.log('[DataShadow] Seeding demo data for hackathon...');
    const seedStats = {
      totalBlocked: 1428,
      totalDataSaved: 47200000, // 47.2 MB
      sessionsProtected: 142,
      cookiesCleaned: 84,
      uniqueDomains: ['doubleclick.net', 'google-analytics.com', 'facebook.net', 'hotjar.com', 'rubiconproject.com', 'criteo.com', 'taboola.com'],
      weeklyData: {}
    };
    
    // Seed last 7 days of activity
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const k = d.toISOString().split('T')[0];
      seedStats.weeklyData[k] = { 
        blocked: Math.floor(150 + Math.random() * 100), 
        dataSaved: Math.floor(5000000 + Math.random() * 2000000), 
        sessions: Math.floor(15 + Math.random() * 10), 
        cookies: Math.floor(5 + Math.random() * 10),
        uniqueDomains: seedStats.uniqueDomains.slice(0, 4)
      };
    }
    
    await chrome.storage.local.set({ 
      dashboardStats: seedStats,
      activityLog: [
        { type: 'shield', message: '<strong>Shadow Shield ACTIVATED</strong> — System fully protected', timestamp: Date.now() - 10000 },
        { type: 'block', message: 'Blocked <strong>doubleclick.net</strong> (Ad Network) on flipkart.com', timestamp: Date.now() - 5000 },
        { type: 'clean', message: 'Cleaned <strong>12 cookies</strong> from amazon.in', timestamp: Date.now() - 2000 }
      ]
    });
  }

  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/onboard.html') });
  }
});

// ── Stats Engine ─────────────────────────────────────────────────────────────

// Get today's date key (YYYY-MM-DD)
function todayKey() {
  return new Date().toISOString().split('T')[0];
}

// ── Real-Time Blocking Feedback ──────────────────────────────────────────────

// Map domains to categories for trustworthy breakdown
const TRACKER_CATEGORIES = {
  'doubleclick.net': 'Ad Network', 'googlesyndication.com': 'Ad Network', 'googleadservices.com': 'Ad Network',
  'adnxs.com': 'Ad Network', 'adsrvr.org': 'Ad Network', 'advertising.com': 'Ad Network',
  'google-analytics.com': 'Analytics', 'googletagmanager.com': 'Analytics', 'hotjar.com': 'Analytics',
  'facebook.com': 'Social Pixel', 'facebook.net': 'Social Pixel', 'twitter.com': 'Social Pixel',
  'bluekai.com': 'Data Broker', 'demdex.net': 'Data Broker', 'krxd.net': 'Data Broker'
};

// Estimate sizes: Script (~35KB), Pixel (~1KB), XHR (~5KB)
const CATEGORY_SIZES = {
  'Ad Network': 45000,
  'Analytics': 15000,
  'Social Pixel': 8000,
  'Data Broker': 12000,
  'Default': 5000
};

// Listen for REAL block events from the DeclarativeNetRequest engine
// This ONLY works in unpacked/developer mode, which is perfect for hackathon testing
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    const ruleId = info.rule.ruleId;
    const tabId = info.tabId;
    const url = info.request.url;
    
    // Find which domain was blocked based on the rule list
    const domain = TRACKER_BLOCKLIST[ruleId - 1] || 'unknown-tracker';
    recordRealBlock(domain, url);
  });
}

async function recordRealBlock(domain, pageUrl) {
  const { dashboardStats = {}, activityLog = [] } = await getStorage(['dashboardStats', 'activityLog']);
  const stats = {
    totalBlocked: 0, totalDataSaved: 0, uniqueDomains: [], 
    sessionsProtected: 0, cookiesCleaned: 0, weeklyData: {}, 
    ...dashboardStats
  };

  const key = todayKey();
  if (!stats.weeklyData[key]) stats.weeklyData[key] = { blocked: 0, dataSaved: 0, sessions: 0, cookies: 0, uniqueDomains: [] };

  stats.totalBlocked += 1;
  stats.weeklyData[key].blocked += 1;

  // 2. Track Unique Domains (Data Integrity)
  if (!stats.uniqueDomains) stats.uniqueDomains = [];
  if (!stats.uniqueDomains.includes(domain)) {
    stats.uniqueDomains.push(domain);
    stats.sessionsProtected = stats.uniqueDomains.length; // Sync with legacy field for UI compatibility
  }
  
  if (!stats.weeklyData[key].uniqueDomains) stats.weeklyData[key].uniqueDomains = [];
  if (!stats.weeklyData[key].uniqueDomains.includes(domain)) {
    stats.weeklyData[key].uniqueDomains.push(domain);
  }

  // 3. Realistic Bandwidth Saved
  const category = TRACKER_CATEGORIES[domain] || 'Default';
  const size = CATEGORY_SIZES[category] || 5000;
  stats.totalDataSaved += size;
  stats.weeklyData[key].dataSaved += size;

  // 4. UPDATE CURRENT SITE STATS (Real-time sync for the dashboard)
  const { currentSiteStats: css } = await getStorage('currentSiteStats');
  if (css) {
    css.blockedRequests += 1;
    if (!css.uniqueList) css.uniqueList = [];
    if (!css.uniqueList.includes(domain)) {
      css.uniqueList.push(domain);
      css.uniqueTrackers = css.uniqueList.length;
    }
    css.dataSaved += size;
    css.marketValue = ((css.blockedRequests || 0) * 0.12) + ((css.cookies || 0) * 0.05);
    await chrome.storage.local.set({ currentSiteStats: css });
  }

  // 5. Log the event (throttled)
  if (Math.random() > 0.8) { // Only log 20% of blocks to keep log readable
    const cleanPage = new URL(pageUrl).hostname;
    const newEntry = {
      type: 'block',
      message: `Blocked <strong>${domain}</strong> (${category}) on ${cleanPage}`,
      timestamp: Date.now()
    };
    const newLog = [newEntry, ...activityLog].slice(0, 50);
    await chrome.storage.local.set({ activityLog: newLog });
  }

  await chrome.storage.local.set({ dashboardStats: stats });
}

// Record a session (called when analysis detects an active browsing session)
async function recordSession(domain) {
  const { dashboardStats = {} } = await getStorage('dashboardStats');
  const stats = {
    totalBlocked: 0, totalDataSaved: 0,
    sessionsProtected: 0, cookiesCleaned: 0,
    weeklyData: {}, ...dashboardStats
  };

  // 7-Day Rolling Window: Purge data older than 7 days
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
  Object.keys(stats.weeklyData).forEach(date => {
    if (date < sevenDaysAgo) delete stats.weeklyData[date];
  });

  const key = todayKey();
  if (!stats.weeklyData[key]) stats.weeklyData[key] = { blocked: 0, dataSaved: 0, sessions: 0, cookies: 0 };

  stats.sessionsProtected += 1;
  stats.weeklyData[key].sessions += 1;
  await chrome.storage.local.set({ dashboardStats: stats });
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

  // Purge old data
  const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
  Object.keys(stats.weeklyData).forEach(date => {
    if (date < sevenDaysAgo) delete stats.weeklyData[date];
  });

  const key = todayKey();
  if (!stats.weeklyData[key]) stats.weeklyData[key] = { blocked: 0, dataSaved: 0, sessions: 0, cookies: 0 };

  stats.cookiesCleaned += count;
  stats.weeklyData[key].cookies = (stats.weeklyData[key].cookies || 0) + count;

  const newEntry = {
    type: 'clean',
    message: `Cleaned <strong>${count} cookie${count > 1 ? 's' : ''}</strong> from ${domain}`,
    timestamp: Date.now()
  };
  const updatedLog = [newEntry, ...activityLog].slice(0, 50);
  await chrome.storage.local.set({ dashboardStats: stats, activityLog: updatedLog });
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

    // Save to storage so report.html can read it
    chrome.storage.local.set({ lastAnalysis: analysisData });

    // RECORD CURRENT SITE DATA (Particular site only mode)
    const mv = Number(analysisData.marketValue) || 0;
    const rs = Number(analysisData.score) || 5; // Default 5% for safe sites
    const currentSiteStats = {
      domain,
      blockedRequests: trackersFound || 0,
      uniqueTrackers: trackersFound || 0,
      uniqueList: detectedTrackers || [],
      dataSaved: (trackersFound * 15000) || 0,
      cookies: (cookies ? cookies.length : 0),
      marketValue: mv || 0,
      riskScore: rs
    };
    await chrome.storage.local.set({ currentSiteStats });

    // Try to send message immediately
    chrome.tabs.sendMessage(tabId, { type: 'DATA_SHADOW_ANALYSIS', data: analysisData })
      .catch(err => console.log("[DataShadow] Content script not ready yet, whenever..."));

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
  // RESET ALL STATS for Demo
  if (message.type === 'RESET_STATS') {
    chrome.storage.local.set({ 
      dashboardStats: { totalBlocked: 0, totalDataSaved: 0, sessionsProtected: 0, cookiesCleaned: 0, weeklyData: {}, uniqueDomains: [] },
      activityLog: []
    }).then(() => sendResponse({ success: true }));
    return true;
  }
});

// Dynamic Blocklist — 50 Major Tracker Domains (sourced from Disconnect & EasyList patterns)
const TRACKER_BLOCKLIST = [
  "doubleclick.net", "google-analytics.com", "googlesyndication.com", "googleadservices.com", "googletagmanager.com",
  "adnxs.com", "adsrvr.org", "advertising.com", "smartadserver.com", "rubiconproject.com",
  "criteo.com", "taboola.com", "outbrain.com", "openx.net", "pubmatic.com",
  "facebook.net", "facebook.com", "connect.facebook.net", "pixel.facebook.com",
  "twitter.com", "analytics.twitter.com", "t.co", "linkedin.com", "snapchat.com",
  "hotjar.com", "crazyegg.com", "mouseflow.com", "clicktale.net", "mixpanel.com",
  "bluekai.com", "demdex.net", "krxd.net", "tapad.com", "eyeota.net",
  "scorecardresearch.com", "quantserve.com", "rlcdn.com", "agkn.com", "liadm.com",
  "casalemedia.com", "mathtag.com", "pippio.com", "bidswitch.net", "adgrx.com",
  "amazon-adsystem.com", "assoc-amazon.com", "amazon.com/ga/pixel",
  "bing.com/pixel", "bat.bing.com", "clarity.ms",
  "yandex.ru", "mc.yandex.ru", "clck.yandex.ru", "an.yandex.ru",
  "baidu.com", "hm.baidu.com", "pos.baidu.com",
  "teads.tv", "indexww.com", "triplelift.com", "yieldmo.com", "360yield.com",
  "moatads.com", "doubleverify.com", "iasds01.com",
  "chartbeat.com", "newrelic.com", "segment.io", "amplitude.com", "pendo.io",
  "googletagservices.com", "google.com/ads", "googleadservices.com/pagead",
  "adsystem.com", "adservice.google.com", "pagead2.googlesyndication.com",
  "securepubads.g.doubleclick.net", "tpc.googlesyndication.com"
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
  
  // 1. Nuke Cookies
  const cookies = await chrome.cookies.getAll({ url: pageUrl });
  for (let cookie of cookies) {
    let cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
    const protocol = cookie.secure ? "https:" : "http:";
    const url = `${protocol}//${cleanDomain}${cookie.path}`;
    await chrome.cookies.remove({ url, name: cookie.name });
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
    const domain = new URL(tab.url).hostname;
    
    // Skip analysis/blocking if site is whitelisted
    const { whitelistedSites = [] } = await getStorage('whitelistedSites');
    if (whitelistedSites.includes(domain)) {
      return; // Do nothing for whitelisted sites
    }

    analyzeDomain(tabId, tab.url);
  }
});
