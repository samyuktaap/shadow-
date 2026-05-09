// DataShadow — What-If Privacy Simulation Engine
// 100% LOCAL. Simulation only — no real settings are changed.

// ── Simulation Toggle Definitions ──
const TOGGLES = [
  {
    id: 'blockTrackers',
    icon: '🛡️',
    label: 'Block All Trackers',
    desc: 'Neutralize ad networks, analytics & social pixels',
    impact: '-35% exposure',
    reductions: { tracking: 70, dataSharing: 30, fingerprint: 10, permission: 0, overall: 35 }
  },
  {
    id: 'blockCookies',
    icon: '🍪',
    label: 'Block Third-Party Cookies',
    desc: 'Prevent cross-site profiling via persistent IDs',
    impact: '-20% exposure',
    reductions: { tracking: 30, dataSharing: 40, fingerprint: 5, permission: 0, overall: 20 }
  },
  {
    id: 'revokeLocation',
    icon: '📍',
    label: 'Revoke Location Access',
    desc: 'Stop sites from knowing your physical position',
    impact: '-15% exposure',
    reductions: { tracking: 5, dataSharing: 20, fingerprint: 10, permission: 50, overall: 15 }
  },
  {
    id: 'revokeCamera',
    icon: '📷',
    label: 'Disable Camera Permission',
    desc: 'Prevent unauthorized webcam access',
    impact: '-10% exposure',
    reductions: { tracking: 0, dataSharing: 5, fingerprint: 5, permission: 40, overall: 10 }
  },
  {
    id: 'revokeMic',
    icon: '🎙️',
    label: 'Disable Microphone Permission',
    desc: 'Block passive audio collection',
    impact: '-10% exposure',
    reductions: { tracking: 0, dataSharing: 5, fingerprint: 5, permission: 40, overall: 10 }
  },
  {
    id: 'blockCrossSite',
    icon: '🔗',
    label: 'Prevent Cross-Site Tracking',
    desc: 'Stop trackers from following you across domains',
    impact: '-25% exposure',
    reductions: { tracking: 50, dataSharing: 35, fingerprint: 10, permission: 0, overall: 25 }
  },
  {
    id: 'blockFingerprint',
    icon: '🧬',
    label: 'Block Fingerprinting Scripts',
    desc: 'Prevent device & browser identity extraction',
    impact: '-20% exposure',
    reductions: { tracking: 15, dataSharing: 10, fingerprint: 80, permission: 0, overall: 20 }
  }
];

// ── Privacy Insight Messages ──
const INSIGHTS = {
  blockTrackers: 'Blocking trackers <strong>significantly reduces behavioral profiling</strong>. Ad networks can no longer build a shadow profile of your browsing habits.',
  blockCookies: 'Third-party cookies are the backbone of <strong>cross-site surveillance</strong>. Blocking them prevents companies from linking your identity across websites.',
  revokeLocation: 'Removing location access <strong>lowers identity exposure risk</strong> by preventing precise geo-targeting and physical movement tracking.',
  revokeCamera: 'Camera access is a <strong>high-severity permission</strong>. Disabling it eliminates the risk of unauthorized visual data capture.',
  revokeMic: 'Microphone access enables <strong>passive audio fingerprinting</strong>. Some scripts use ultrasonic beacons to track you across devices.',
  blockCrossSite: 'Cross-site tracking is how companies <strong>build a complete profile</strong> of you. This is the single most impactful privacy protection.',
  blockFingerprint: 'Browser fingerprinting creates a <strong>unique digital DNA</strong> from your hardware and software. Blocking it makes you invisible to identity algorithms.',
  default: 'Toggle protections on the left to see how your privacy exposure changes in real-time. Each toggle simulates a specific privacy improvement.'
};

// ── State ──
let baseMetrics = {
  tracking: 75,
  dataSharing: 80,
  fingerprint: 55,
  permission: 60,
  overall: 68
};

let simulationState = {};
let animationFrameId = null;
let currentAnimatedMetrics = null;

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  // Nav links
  const navigateTo = (page) => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      window.location.href = chrome.runtime.getURL(`src/pages/${page}.html`);
    } else {
      window.location.href = `${page}.html`;
    }
  };

  const dashNav = document.getElementById('nav-dashboard');
  const proNav = document.getElementById('nav-pro');
  const reportNav = document.getElementById('nav-report');
  if (dashNav) dashNav.onclick = (e) => { e.preventDefault(); navigateTo('dashboard'); };
  if (proNav) proNav.onclick = (e) => { e.preventDefault(); navigateTo('pro'); };
  if (reportNav) reportNav.onclick = (e) => { e.preventDefault(); navigateTo('report'); };

  // Load real data from extension storage
  const isExt = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  if (isExt) {
    try {
      const data = await chrome.storage.local.get(['lastAnalysis', 'currentSiteStats']);
      const analysis = data.lastAnalysis || data.currentSiteStats || {};

      if (analysis.domain) {
        document.getElementById('sim-domain').textContent = analysis.domain.toUpperCase();
      }

      // Build REAL exposure metrics from actual analysis data
      const trackers = analysis.trackersFound || 0;
      const cookies = analysis.cookieCount || 0;
      const score = analysis.score || 0;

      baseMetrics = {
        tracking: Math.min(95, 20 + (trackers * 8)),
        dataSharing: Math.min(95, 25 + (cookies * 2) + (trackers * 3)),
        fingerprint: Math.min(90, 20 + (trackers * 5)),
        permission: Math.min(85, 15 + (score * 0.5)),
        overall: Math.min(95, 15 + (trackers * 6) + (cookies * 1.5))
      };
    } catch (e) {
      console.error('[DataShadow WhatIf] Storage error:', e);
    }
  }

  // Initialize toggles
  TOGGLES.forEach(t => { simulationState[t.id] = false; });

  // Render toggles
  renderToggles();

  // Initial draw
  currentAnimatedMetrics = { ...baseMetrics };
  drawRadar(baseMetrics, baseMetrics);
  updateScores(baseMetrics, baseMetrics);

  // Reset button
  document.getElementById('reset-btn').onclick = resetSimulation;
});

// ── Render Toggle Controls ──
function renderToggles() {
  const list = document.getElementById('toggle-list');
  list.innerHTML = '';

  TOGGLES.forEach(toggle => {
    const item = document.createElement('div');
    item.className = `toggle-item ${simulationState[toggle.id] ? 'active' : ''}`;
    item.id = `toggle-item-${toggle.id}`;
    item.innerHTML = `
      <div class="toggle-label">
        <div class="toggle-icon">${toggle.icon}</div>
        <div>
          <div class="toggle-text">${toggle.label}</div>
          <div class="toggle-desc">${toggle.desc}</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="toggle-impact">${toggle.impact}</span>
        <label class="switch">
          <input type="checkbox" id="toggle-${toggle.id}" ${simulationState[toggle.id] ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </div>
    `;
    list.appendChild(item);

    // Attach listener
    const checkbox = item.querySelector('input');
    checkbox.addEventListener('change', () => {
      simulationState[toggle.id] = checkbox.checked;
      item.className = `toggle-item ${checkbox.checked ? 'active' : ''}`;
      runSimulation();
    });
  });
}

// ── Simulation Engine ──
function runSimulation() {
  const simMetrics = { ...baseMetrics };

  // Find last active toggle for insight
  let lastActiveToggle = null;

  TOGGLES.forEach(toggle => {
    if (simulationState[toggle.id]) {
      lastActiveToggle = toggle.id;
      // Apply reductions (diminishing returns — each subsequent toggle has slightly less impact)
      simMetrics.tracking = Math.max(5, simMetrics.tracking - toggle.reductions.tracking * (simMetrics.tracking / 100));
      simMetrics.dataSharing = Math.max(5, simMetrics.dataSharing - toggle.reductions.dataSharing * (simMetrics.dataSharing / 100));
      simMetrics.fingerprint = Math.max(5, simMetrics.fingerprint - toggle.reductions.fingerprint * (simMetrics.fingerprint / 100));
      simMetrics.permission = Math.max(5, simMetrics.permission - toggle.reductions.permission * (simMetrics.permission / 100));
      simMetrics.overall = Math.max(5, simMetrics.overall - toggle.reductions.overall * (simMetrics.overall / 100));
    }
  });

  // Round values
  Object.keys(simMetrics).forEach(k => { simMetrics[k] = Math.round(simMetrics[k]); });

  // Animate transition
  animateRadarTransition(baseMetrics, simMetrics);
  updateScores(baseMetrics, simMetrics);

  // Update insight
  const insightEl = document.getElementById('insight-box');
  if (lastActiveToggle && INSIGHTS[lastActiveToggle]) {
    insightEl.innerHTML = INSIGHTS[lastActiveToggle];
  } else {
    insightEl.innerHTML = INSIGHTS.default;
  }
}

// ── Animated Radar Transition ──
function animateRadarTransition(before, targetAfter) {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  const start = { ...currentAnimatedMetrics };
  const duration = 600; // ms
  const startTime = performance.now();

  function step(timestamp) {
    const elapsed = timestamp - startTime;
    const progress = Math.min(1, elapsed / duration);
    // Ease-out cubic
    const ease = 1 - Math.pow(1 - progress, 3);

    const current = {};
    Object.keys(targetAfter).forEach(k => {
      current[k] = start[k] + (targetAfter[k] - start[k]) * ease;
    });

    currentAnimatedMetrics = { ...current };
    drawRadar(before, current);

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(step);
    }
  }

  animationFrameId = requestAnimationFrame(step);
}

// ── Radar Chart Drawing Engine ──
function drawRadar(before, after) {
  const canvas = document.getElementById('radar-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const maxR = Math.min(cx, cy) - 60;

  ctx.clearRect(0, 0, W, H);

  const labels = ['Tracking', 'Data Sharing', 'Fingerprint', 'Permissions', 'Overall Risk'];
  const keys = ['tracking', 'dataSharing', 'fingerprint', 'permission', 'overall'];
  const numAxes = labels.length;
  const angleStep = (Math.PI * 2) / numAxes;
  const startAngle = -Math.PI / 2; // Start from top

  // Draw concentric rings
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0];
  rings.forEach((ring, i) => {
    ctx.beginPath();
    for (let j = 0; j <= numAxes; j++) {
      const angle = startAngle + j * angleStep;
      const x = cx + Math.cos(angle) * maxR * ring;
      const y = cy + Math.sin(angle) * maxR * ring;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(255,255,255,${0.04 + i * 0.02})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Ring labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'; // Brighter
    ctx.font = '600 11px Inter'; // Larger and bolder
    ctx.textAlign = 'left';
    // Add text shadow for better contrast
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(`${Math.round(ring * 100)}`, cx + 6, cy - maxR * ring + 4);
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  });

  // Draw axes
  for (let i = 0; i < numAxes; i++) {
    const angle = startAngle + i * angleStep;
    const x = cx + Math.cos(angle) * maxR;
    const y = cy + Math.sin(angle) * maxR;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Axis labels
    const lx = cx + Math.cos(angle) * (maxR + 40); // Move out slightly more
    const ly = cy + Math.sin(angle) * (maxR + 40);
    ctx.fillStyle = '#f8fafc'; // Much brighter white
    ctx.font = '800 13px Inter'; // Larger and bolder
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 6;
    ctx.fillText(labels[i], lx, ly);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  // Draw BEFORE polygon (red)
  drawPolygon(ctx, cx, cy, maxR, keys.map(k => before[k] / 100), startAngle, angleStep, numAxes, 'rgba(255,51,51,0.25)', 'rgba(255,51,51,0.8)', 2);

  // Draw AFTER polygon (green)
  drawPolygon(ctx, cx, cy, maxR, keys.map(k => after[k] / 100), startAngle, angleStep, numAxes, 'rgba(0,255,136,0.15)', 'rgba(0,255,136,0.8)', 2.5);

  // Draw data points
  keys.forEach((k, i) => {
    const angle = startAngle + i * angleStep;

    // Before dot
    const bx = cx + Math.cos(angle) * maxR * (before[k] / 100);
    const by = cy + Math.sin(angle) * maxR * (before[k] / 100);
    ctx.beginPath();
    ctx.arc(bx, by, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ff3333';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // After dot
    const ax = cx + Math.cos(angle) * maxR * (after[k] / 100);
    const ay = cy + Math.sin(angle) * maxR * (after[k] / 100);
    ctx.beginPath();
    ctx.arc(ax, ay, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff88';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Glow on after dot
    ctx.beginPath();
    ctx.arc(ax, ay, 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,255,136,0.15)';
    ctx.fill();
  });
}

function drawPolygon(ctx, cx, cy, maxR, values, startAngle, angleStep, numAxes, fillColor, strokeColor, lineWidth) {
  ctx.beginPath();
  for (let i = 0; i <= numAxes; i++) {
    const idx = i % numAxes;
    const angle = startAngle + idx * angleStep;
    const r = maxR * values[idx];
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

// ── Score Display Update ──
function updateScores(before, after) {
  const beforeScore = Math.round(before.overall);
  const afterScore = Math.round(after.overall);
  const reduction = beforeScore > 0 ? Math.round(((beforeScore - afterScore) / beforeScore) * 100) : 0;

  animateNumber('score-before', beforeScore);
  animateNumber('score-after', afterScore);

  const reductionEl = document.getElementById('score-reduction');
  reductionEl.textContent = `${reduction}%`;

  // Update color of "after" box based on improvement
  const afterBox = document.querySelector('.score-box.after');
  if (afterScore < 25) {
    afterBox.style.borderColor = 'rgba(0,255,136,0.5)';
    afterBox.style.boxShadow = '0 0 30px rgba(0,255,136,0.1)';
  } else if (afterScore < 50) {
    afterBox.style.borderColor = 'rgba(0,255,136,0.3)';
    afterBox.style.boxShadow = 'none';
  } else {
    afterBox.style.borderColor = 'rgba(245,158,11,0.3)';
    afterBox.style.boxShadow = 'none';
  }
}

function animateNumber(elementId, target) {
  const el = document.getElementById(elementId);
  const current = parseInt(el.textContent) || 0;
  const diff = target - current;
  const duration = 400;
  const startTime = performance.now();

  function step(timestamp) {
    const elapsed = timestamp - startTime;
    const progress = Math.min(1, elapsed / duration);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(current + diff * ease);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── Reset ──
function resetSimulation() {
  TOGGLES.forEach(t => { simulationState[t.id] = false; });
  renderToggles();
  animateRadarTransition(baseMetrics, baseMetrics);
  updateScores(baseMetrics, baseMetrics);
  document.getElementById('insight-box').innerHTML = INSIGHTS.default;
}
