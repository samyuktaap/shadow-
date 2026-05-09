/**
 * DataShadow Telemetry Processor
 * Centralized logic for scoring and bandwidth analytics.
 */

const TelemetryProcessor = {
  // Average resource sizes for accurate "Saved Data" estimation when blocked
  // Sourced from HTTP Archive averages
  RESOURCE_SIZES: {
    script: 35000,   // 35KB avg script
    image: 150000,   // 150KB avg image
    sub_frame: 50000, // 50KB avg iframe
    xmlhttprequest: 2000, // 2KB avg XHR/Fetch
    other: 5000
  },

  /**
   * Calculate Tracking Aggression Score (0-100)
   * Based on tracker density, categories, and frequency.
   */
  calculateAggressionScore(data) {
    const { trackers = [], fingerprintingAttempts = 0, frequency = 0 } = data;
    
    let score = (trackers.length || 0) * 5; 
    score += (fingerprintingAttempts || 0) * 15; 
    score += (frequency || 0) * 2; 
    
    return Math.min(100, Math.max(0, Math.round(score)));
  },

  /**
   * Calculate Privacy Risk Score (0-100, where 100 is MAX RISK)
   */
  calculateRiskScore(data) {
    const { aggregatorSites = 0, trackers = [], isHttps = true } = data;
    
    let risk = (trackers.length * 4);
    if (!isHttps) risk += 25;
    if (aggregatorSites > 0) risk += 30; 
    
    return Math.min(100, Math.max(0, Math.round(risk)));
  },

  /**
   * Determine Severity Level
   */
  getSeverity(score) {
    if (score > 75) return { label: 'CRITICAL', color: '#ff3333' };
    if (score > 45) return { label: 'HIGH', color: '#ff6666' };
    if (score > 20) return { label: 'MODERATE', color: '#f59e0b' };
    return { label: 'LOW', color: '#00ff88' };
  },

  /**
   * Estimate saved bytes for a blocked resource
   */
  estimateSavedBytes(type) {
    return this.RESOURCE_SIZES[type] || this.RESOURCE_SIZES.other;
  }
};

// Export if in module context, otherwise keep global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TelemetryProcessor;
}
