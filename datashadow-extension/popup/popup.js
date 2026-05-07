// DataShadow Popup Logic (Person 1)

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const scoreElement = document.getElementById('score');

  if (tab.url && tab.url.startsWith('http')) {
    const domain = new URL(tab.url).hostname;
    
    // Fetch cookies for the current domain
    const cookies = await chrome.cookies.getAll({ domain });
    
    // Simple Score Calculation (Engine Part)
    // 0 is safe, 100 is danger.
    let score = Math.min(cookies.length * 5, 100);
    
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
      // Logic to disable shield (clear rules)
      chrome.runtime.sendMessage({ type: 'DISABLE_SHIELD' });
    }
  };
});

document.getElementById('analyze-btn').onclick = () => {
  // Navigation logic to the full report (Person 4 part)
  chrome.tabs.create({ url: 'https://datashadow.example.com/analysis' });
};
