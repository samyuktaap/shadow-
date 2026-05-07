// DataShadow Popup Logic (Person 1)

document.addEventListener('DOMContentLoaded', async () => {
  const scoreElement = document.getElementById('score');

  // Sync the popup score with the EXACT background analysis
  const { lastAnalysis } = await chrome.storage.local.get('lastAnalysis');
  
  if (lastAnalysis) {
    // Fallback calculation just in case the stored data is from an older version
    let score = lastAnalysis.score !== undefined 
      ? lastAnalysis.score 
      : Math.min(lastAnalysis.cookieCount * 5, 100);
    
    scoreElement.innerText = score;
    
    // Color coding based on risk
    if (score > 70) scoreElement.style.color = '#ff3333'; // High
    else if (score > 30) scoreElement.style.color = '#ffaa00'; // Medium
    else scoreElement.style.color = '#00ff88'; // Low
  } else {
    scoreElement.innerText = '--';
    scoreElement.style.color = '#555';
  }

  // Shadow Shield Toggle Logic
  const shieldBtn = document.getElementById('shield-toggle');
  
  // Check current state from storage
  const { shieldActive } = await chrome.storage.local.get('shieldActive');
  if (shieldActive) {
    shieldBtn.classList.add('active');
    shieldBtn.innerText = 'ON';
  }

  shieldBtn.onclick = async () => {
    const active = shieldBtn.classList.toggle('active');
    shieldBtn.innerText = active ? 'ON' : 'OFF';
    
    // Save state and notify background
    await chrome.storage.local.set({ shieldActive: active });
    if (active) {
      chrome.runtime.sendMessage({ type: 'ENABLE_SHIELD' });
    } else {
      chrome.runtime.sendMessage({ type: 'DISABLE_SHIELD' });
    }
  };

  // Analyze button inside DOMContentLoaded (fix!)
  document.getElementById('analyze-btn').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('report.html') });
  };
});
