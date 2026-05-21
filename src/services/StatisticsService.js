// Pure statistical functions — no side effects, no imports

export const Statistics = {
  mean(values) {
    if (!values?.length) return null
    return values.reduce((a, b) => a + b, 0) / values.length
  },

  variance(values) {
    if (!values?.length) return null
    const m = Statistics.mean(values)
    return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length
  },

  stdDev(values) {
    const v = Statistics.variance(values)
    return v == null ? null : Math.sqrt(v)
  },

  // Sample standard deviation (Bessel-corrected)
  sampleStdDev(values) {
    if (!values || values.length < 2) return null
    const m = Statistics.mean(values)
    return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1))
  },

  zScore(value, mean, sd) {
    if (sd == null || sd === 0) return 0
    return (value - mean) / sd
  },

  median(values) {
    if (!values?.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  },

  percentile(values, p) {
    if (!values?.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    const idx = (p / 100) * (sorted.length - 1)
    const lo = Math.floor(idx)
    const hi = Math.ceil(idx)
    if (lo === hi) return sorted[lo]
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
  },

  // Confidence interval: 95% two-tailed for given n
  confidenceInterval95(mean, sd, n) {
    if (n < 2 || sd == null) return null
    const se = sd / Math.sqrt(n)
    const z = 1.96 // 95% CI
    return { lower: mean - z * se, upper: mean + z * se, se }
  },

  // Interpret z-score as stoplight severity
  stoplightFromZ(z) {
    const abs = Math.abs(z)
    if (abs < 2) return 'GREEN'
    if (abs < 3) return 'YELLOW'
    return 'RED'
  },

  // Confidence score: 0–1 based on sample size and z-score magnitude
  confidenceScore(z, n) {
    // Low confidence with small n; high confidence with large n and high z
    const nFactor = Math.min(1, (n - 1) / 4)    // saturates at n=5
    const zFactor = Math.min(1, Math.abs(z) / 4) // saturates at z=4
    return parseFloat((nFactor * 0.6 + zFactor * 0.4).toFixed(3))
  },

  // IQR-based outlier detection (Tukey fences)
  iqrOutliers(values, k = 1.5) {
    if (values.length < 4) return []
    const q1 = Statistics.percentile(values, 25)
    const q3 = Statistics.percentile(values, 75)
    const iqr = q3 - q1
    const lower = q1 - k * iqr
    const upper = q3 + k * iqr
    return values.map((v, i) => ({ value: v, index: i, outlier: v < lower || v > upper }))
  },

  // Linear trend slope (simple least-squares)
  trendSlope(ys) {
    if (!ys || ys.length < 2) return 0
    const n = ys.length
    const xs = ys.map((_, i) => i)
    const mx = Statistics.mean(xs)
    const my = Statistics.mean(ys)
    const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0)
    const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
    return den === 0 ? 0 : num / den
  },

  // Participation Shift Index (PSI)
  // Composite of ballot-selection deviation + turnout variance + county divergence
  participationShiftIndex({ ballotSelectionZ, turnoutZ, countyDivergenceZ, competitiveWeight = 1 }) {
    const raw = (
      Math.abs(ballotSelectionZ) * 0.40 +
      Math.abs(turnoutZ)         * 0.30 +
      Math.abs(countyDivergenceZ)* 0.30
    ) * competitiveWeight

    // Normalize to 0–100 scale (z=3 → 100)
    return Math.min(100, parseFloat((raw * 33.33).toFixed(1)))
  },

  psiLabel(psi) {
    if (psi < 25) return 'Low'
    if (psi < 50) return 'Moderate'
    if (psi < 75) return 'Elevated'
    return 'High'
  },

  psiSeverity(psi) {
    if (psi < 25) return 'GREEN'
    if (psi < 50) return 'YELLOW'
    return 'RED'
  },
}
