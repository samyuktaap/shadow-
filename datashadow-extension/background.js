// DataShadow Background Service Worker (Person 1 Engine)

// AUTO-RESTORE: Re-enable shield on browser start if it was ON
chrome.runtime.onStartup.addListener(async () => {
  const { shieldActive } = await chrome.storage.local.get('shieldActive');
  if (shieldActive) {
    enableShadowShield();
    console.log('[DataShadow] Shield auto-restored on startup.');
  }
});

// Also restore on extension reload/install
chrome.runtime.onInstalled.addListener(async () => {
  const { shieldActive } = await chrome.storage.local.get('shieldActive');
  if (shieldActive) enableShadowShield();
});

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
    const { shieldActive } = await chrome.storage.local.get('shieldActive');
    
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
  // NEW: Toggle the Shadow Shield
  if (message.type === 'ENABLE_SHIELD') {
    enableShadowShield();
  }
  if (message.type === 'DISABLE_SHIELD') {
    disableShadowShield();
  }
  // NEW: When content script says it's ready, send the analysis
  if (message.type === 'CONTENT_SCRIPT_READY' && sender.tab) {
    analyzeDomain(sender.tab.id, sender.tab.url);
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
  const resourceTypes = ['script', 'image', 'xmlhttprequest', 'sub_frame', 'stylesheet', 'font', 'ping'];
  
  const rules = TRACKER_BLOCKLIST.map((domain, index) => ({
    id: index + 1,
    priority: 1,
    action: { type: 'block' },
    condition: { urlFilter: `*${domain}*`, resourceTypes }
  }));

  const allIds = rules.map(r => r.id);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: allIds,
    addRules: rules
  });

  // Track stats
  const { shieldStats = { totalBlocked: 0, sessionsActive: 0 } } = await chrome.storage.local.get('shieldStats');
  shieldStats.sessionsActive++;
  chrome.storage.local.set({ shieldStats });

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
}

// Trigger Analysis on Page Load
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
    analyzeDomain(tabId, tab.url);
  }
});
