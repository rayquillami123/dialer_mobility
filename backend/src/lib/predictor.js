/**
 * Predictive Dialing Rate Calculator.
 *
 * This function computes an adjusted dial rate for a predictive campaign
 * based on real-time and target metrics.
 *
 * @param {object} params - The parameters for the calculation.
 * @param {number} params.targetOccupancy - Target agent occupancy rate (e.g., 0.85 for 85%).
 * @param {number} params.avgHandleTimeSec - Average handle time in seconds (talk + wrap-up).
 * @param {number} params.observedAsr - Observed Answer-Seizure Ratio (e.g., 0.4 for 40%).
 * @param {number} params.observedAbandonRate - Observed abandon rate (e.g., 0.02 for 2%).
 * @param {number} params.maxAbandonRate - Maximum allowed abandon rate (e.g., 0.03 for 3%).
 * @param {number} params.agentsAvailable - Number of agents available to take calls.
 * @param {number} params.currentPacing - The current pacing ratio.
 * @returns {number} The new, adjusted pacing ratio.
 */
export function computeDialRate({
  targetOccupancy = 0.85,
  avgHandleTimeSec = 240,
  observedAsr = 0.4,
  observedAbandonRate = 0.02,
  maxAbandonRate = 0.03,
  agentsAvailable = 10,
  currentPacing = 2.0
}) {
  if (agentsAvailable === 0 || observedAsr === 0) {
    return 1; // Fallback to a safe, minimal pace.
  }

  // Erlang C formula simplified for dialer context
  // Base rate to keep agents busy
  const basePacing = (agentsAvailable * targetOccupancy * avgHandleTimeSec) / (observedAsr * avgHandleTimeSec);

  // Adjust pacing based on abandon rate
  let adjustmentFactor = 1.0;
  const abandonRateDelta = maxAbandonRate - observedAbandonRate;

  if (abandonRateDelta < -0.005) { // Significantly over abandon cap
    adjustmentFactor = 0.85; // Aggressively reduce
  } else if (abandonRateDelta < 0) { // Slightly over
    adjustmentFactor = 0.95; // Gently reduce
  } else if (abandonRateDelta > 0.01) { // Well under abandon cap
    adjustmentFactor = 1.1; // Gently increase
  }

  let newPacing = basePacing * adjustmentFactor;

  // Smooth the change to avoid wild swings
  newPacing = (currentPacing * 0.7) + (newPacing * 0.3);
  
  // Clamp the pacing ratio to a reasonable range
  return Math.max(1.0, Math.min(newPacing, agentsAvailable * 1.5));
}
