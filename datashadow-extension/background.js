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

async function analyzeDomain(tabId, url) {
  try {
    // Safety: Don't run on chrome:// or about: pages
    if (!url || !url.startsWith('http')) return;

    const domain = new URL(url).hostname;
    // REFINED: Only get cookies that the current page can actually access
    const cookies = await chrome.cookies.getAll({ url: url });
    
    // Check if Shield is ON
    const { shieldActive } = await chrome.storage.local.get('shieldActive');
    
    // Calculate Score (Shield drastically reduces the threat of remaining first-party cookies)
    let rawScore = cookies.length * 5;
    let finalScore = shieldActive ? Math.floor(rawScore * 0.15) : rawScore;
    finalScore = Math.min(finalScore, 100);

    const riskLevel = finalScore >= 50 ? 'HIGH' : 'LOW';
    const trackersFound = Math.floor(cookies.length / 2.5);

    const analysisData = {
      domain,
      cookieCount: cookies.length,
      score: finalScore,
      riskLevel,
      trackersFound,
      trackerNames: cookies.slice(0, 5).map(c => c.name), // Show first 5 examples
      dangerousFields: riskLevel === 'HIGH' ? ['Precise Location', 'Browsing History', 'Device ID'] : []
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

// The "Force Field" Logic (declarativeNetRequest)
async function enableShadowShield() {
  const rules = [
    {
      id: 1,
      priority: 1,
      action: { type: 'block' },
      condition: { urlFilter: '*doubleclick.net*', resourceTypes: ['script', 'image', 'xmlhttprequest'] }
    },
    {
      id: 2,
      priority: 1,
      action: { type: 'block' },
      condition: { urlFilter: '*facebook.com/tr/*', resourceTypes: ['script', 'image'] }
    },
    {
      id: 3,
      priority: 1,
      action: { type: 'block' },
      condition: { urlFilter: '*google-analytics.com*', resourceTypes: ['script', 'xmlhttprequest'] }
    },
    {
      id: 4,
      priority: 1,
      action: { type: 'block' },
      condition: { urlFilter: '*scorecardresearch.com*', resourceTypes: ['script', 'image'] }
    },
    {
      id: 5,
      priority: 1,
      action: { type: 'block' },
      condition: { urlFilter: '*amazon-adsystem.com*', resourceTypes: ['script', 'image'] }
    }
  ];

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1, 2, 3, 4, 5],
    addRules: rules
  });

  console.log("[DataShadow] LEVEL 2 SHADOW SHIELD ACTIVE: Known trackers blocked.");
}

async function disableShadowShield() {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1, 2, 3, 4, 5]
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
