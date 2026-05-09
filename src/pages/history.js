document.addEventListener('DOMContentLoaded', async () => {
  // ── Nav links ──
  const navigateTo = (page) => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      window.location.href = chrome.runtime.getURL(`src/pages/${page}.html`);
    } else {
      window.location.href = `${page}.html`;
    }
  };

  const dashboardNav = document.getElementById('nav-dashboard');
  const proNav = document.getElementById('nav-pro');
  const whatifNav = document.getElementById('nav-whatif');
  const reportNav = document.getElementById('nav-report');

  if (dashboardNav) dashboardNav.onclick = (e) => { e.preventDefault(); navigateTo('dashboard'); };
  if (proNav) proNav.onclick = (e) => { e.preventDefault(); navigateTo('pro'); };
  if (whatifNav) whatifNav.onclick = (e) => { e.preventDefault(); navigateTo('whatif'); };
  if (reportNav) reportNav.onclick = (e) => { e.preventDefault(); navigateTo('report'); };

  let currentHistory = [];

  // Load Data
  chrome.storage.local.get(['privacyHistory'], (data) => {
    currentHistory = data.privacyHistory || [];
    renderHistory();
    renderChart();
    generateInsights();
  });

  // ── Render History List ──
  function renderHistory() {
    const list = document.getElementById('history-list');
    if (currentHistory.length === 0) {
      list.innerHTML = '<div style="color: #888; padding: 20px; text-align: center; background: #111; border-radius: 12px;">No privacy history found. Browse some sites to build your cache.</div>';
      return;
    }

    list.innerHTML = currentHistory.map((entry, index) => {
      const riskClass = entry.exposureLevel === 'HIGH' ? 'risk-high' : (entry.exposureLevel === 'MEDIUM' ? 'risk-med' : 'risk-low');
      const timeStr = new Date(entry.timestamp).toLocaleString();
      return `
        <div class="history-item" data-index="${index}">
          <div class="site-info">
            <div class="site-name">${entry.site}</div>
            <div class="site-time">${timeStr}</div>
          </div>
          <div class="site-stats">
            <div class="stat">
              <div class="stat-val ${riskClass}">${entry.exposureLevel}</div>
              <div class="stat-label">Exposure</div>
            </div>
            <div class="stat">
              <div class="stat-val">${entry.trackers}</div>
              <div class="stat-label">Trackers</div>
            </div>
            <div class="stat">
              <div class="stat-val ${riskClass}">${entry.privacyScore}</div>
              <div class="stat-label">Score</div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach click listeners to items
    document.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = item.getAttribute('data-index');
        openModal(currentHistory[idx]);
      });
    });
  }

  // ── Render Timeline Chart (Custom Canvas) ──
  function renderChart() {
    const canvas = document.getElementById('timelineChart');
    if (!canvas || currentHistory.length === 0) return;
    const ctx = canvas.getContext('2d');
    
    // Set actual canvas size
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;

    // We want chronologically, so reverse the history for chart
    const dataPts = [...currentHistory].reverse();
    if (dataPts.length < 2) {
      ctx.fillStyle = '#888';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Not enough data for timeline. Browse more sites.', width/2, height/2);
      return;
    }

    ctx.clearRect(0, 0, width, height);

    // Draw Grid
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=0; i<=5; i++) {
      let y = padding + (height - 2*padding) * (i/5);
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
    }
    ctx.stroke();

    // Draw Line
    const getX = (idx) => padding + (width - 2*padding) * (idx / (dataPts.length - 1));
    // Score is 0-100, higher is worse risk, wait: privacy score usually 100=max risk.
    const getY = (score) => height - padding - ((height - 2*padding) * (score / 100));

    ctx.beginPath();
    ctx.moveTo(getX(0), getY(dataPts[0].privacyScore));
    for (let i = 1; i < dataPts.length; i++) {
      ctx.lineTo(getX(i), getY(dataPts[i].privacyScore));
    }
    
    // Glow effect
    ctx.shadowColor = 'rgba(56, 189, 248, 0.8)';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.shadowBlur = 0; // reset

    // Draw points
    for (let i = 0; i < dataPts.length; i++) {
      ctx.beginPath();
      ctx.arc(getX(i), getY(dataPts[i].privacyScore), 4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Label Y axis
    ctx.fillStyle = '#888';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Risk 100', padding - 5, padding + 4);
    ctx.fillText('Risk 0', padding - 5, height - padding + 4);

    // Label Title
    ctx.fillStyle = '#ccc';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Privacy Score Over Time', padding, 20);
  }

  // ── Generate Smart Insights ──
  function generateInsights() {
    const container = document.getElementById('insights-container');
    if (currentHistory.length === 0) return;

    let insights = [];
    
    // High risk freq
    const highRiskCount = currentHistory.filter(e => e.exposureLevel === 'HIGH').length;
    if (highRiskCount > 3) {
      insights.push(`You frequently visit high-risk websites (${highRiskCount} in cache). Consider enabling Shadow Shield.`);
    }

    // Trend analysis
    if (currentHistory.length >= 3) {
      const recent = currentHistory.slice(0, 3);
      const older = currentHistory.slice(-3);
      const avgRecent = recent.reduce((sum, e) => sum + e.privacyScore, 0) / recent.length;
      const avgOlder = older.reduce((sum, e) => sum + e.privacyScore, 0) / older.length;
      
      if (avgRecent < avgOlder - 10) {
        insights.push("Your privacy exposure decreased recently. Great job maintaining safe browsing!");
      } else if (avgRecent > avgOlder + 10) {
        insights.push("Your privacy exposure has increased. Be careful with newly visited sites.");
      }
    }

    // Trackers
    const totalTrackers = currentHistory.reduce((sum, e) => sum + e.trackers, 0);
    if (totalTrackers > 50) {
      insights.push(`High tracking volume: ${totalTrackers} trackers recorded across your history.`);
    }

    if (insights.length === 0) {
      insights.push("Your browsing history looks relatively safe right now.");
    }

    container.innerHTML = insights.map(text => `<div class="insight-item">${text}</div>`).join('');
  }

  // ── Modal & Detail View ──
  const modal = document.getElementById('detail-modal');
  let activeEntry = null;

  function openModal(entry) {
    activeEntry = entry;
    document.getElementById('modal-site').innerText = entry.site;
    document.getElementById('modal-time').innerText = "Visited: " + new Date(entry.timestamp).toLocaleString();
    document.getElementById('modal-score').innerText = entry.privacyScore + " / 100";
    document.getElementById('modal-trackers').innerText = entry.trackers;
    
    const expEl = document.getElementById('modal-exposure');
    expEl.innerText = entry.exposureLevel;
    expEl.style.color = entry.exposureLevel === 'HIGH' ? '#ff3333' : (entry.exposureLevel === 'MEDIUM' ? '#ffaa00' : '#00ff88');

    document.getElementById('modal-permissions').innerText = entry.permissions && entry.permissions.length > 0 ? entry.permissions.join(', ') : 'None';

    const trend = document.getElementById('modal-trend');
    if (entry.exposureLevel === 'HIGH') {
      trend.innerText = "High exposure risk. We recommend blocking trackers here.";
      trend.style.color = "#ff3333";
      trend.style.background = "rgba(255,51,51,0.1)";
    } else {
      trend.innerText = "Tracking exposure is well contained.";
      trend.style.color = "#00ff88";
      trend.style.background = "rgba(0,255,136,0.1)";
    }

    modal.style.display = 'flex';
  }

  document.getElementById('modal-close').onclick = () => {
    modal.style.display = 'none';
    activeEntry = null;
  };

  // ── Controls ──
  document.getElementById('btn-clear').onclick = () => {
    if (confirm("Are you sure you want to clear your entire Privacy Cache History?")) {
      chrome.storage.local.set({ privacyHistory: [] }, () => {
        currentHistory = [];
        renderHistory();
        renderChart();
        generateInsights();
      });
    }
  };

  document.getElementById('btn-delete-entry').onclick = () => {
    if (activeEntry) {
      currentHistory = currentHistory.filter(e => e.site !== activeEntry.site || e.timestamp !== activeEntry.timestamp);
      chrome.storage.local.set({ privacyHistory: currentHistory }, () => {
        modal.style.display = 'none';
        renderHistory();
        renderChart();
        generateInsights();
      });
    }
  };

  document.getElementById('btn-export').onclick = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentHistory, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "privacy_history.json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  // Re-render chart on resize
  window.addEventListener('resize', () => {
    renderChart();
  });
});
