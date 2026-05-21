// Georgia Open Primary Intelligence — Anomaly Engine
//
// Seven anomaly categories (never conflated):
//  1. Election Result Anomaly   — candidate vote shares deviate from baselines
//  2. Turnout Anomaly           — total ballot participation vs. historical
//  3. Ballot-Selection Anomaly  — R vs. D ballot share shift
//  4. Vote-Method Anomaly       — Early/Absentee/ED ratio shifts
//  5. Roll-Off Anomaly          — drop in participation across races
//  6. Precinct-Level Anomaly    — precinct deviates from county average
//  7. Contextual Anomaly        — turnout vs. registered voters unusual
//
// Stoplight: GREEN < 2σ / YELLOW 2–3σ / RED ≥ 3σ or multi-category
//
// Performance: every detect function does ONE O(n) groupBy pass to build
// lookup Maps, then uses O(1) Map.get() inside loops instead of
// O(n) elections.filter() calls. Total complexity is O(n) per category.

import { Statistics } from './StatisticsService.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupBy(arr, keyFn) {
  const m = new Map()
  for (const item of arr) {
    const k = keyFn(item)
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(item)
  }
  return m
}

function sumVotes(records) {
  return records.reduce((s, r) => s + (r.votes || 0), 0)
}

function ballotTotals(records) {
  const byType = groupBy(records.filter(r => r.office === 'BALLOT_TOTALS'), r => r.ballotType)
  const R = sumVotes(byType.get('Republican') || [])
  const D = sumVotes(byType.get('Democratic') || [])
  return { R, D, total: R + D }
}

function rShare(records) {
  const { R, D } = ballotTotals(records)
  const total = R + D
  return total > 0 ? R / total : null
}

function turnoutRate(records, registeredVoters) {
  const { total } = ballotTotals(records)
  return registeredVoters > 0 ? total / registeredVoters : null
}

const COMPARABLE = {
  Presidential: ['Presidential Primary', 'Presidential'],
  Midterm:      ['Midterm Primary', 'Midterm'],
}

function priorCycles(allRecords, comparableType, currentYear) {
  const allowed = COMPARABLE[comparableType] || []
  return allRecords.filter(r =>
    r.year < currentYear &&
    allowed.some(t => r.electionType?.includes(t.split(' ')[0]))
  )
}

// ─── Anomaly Record Factory ───────────────────────────────────────────────────

let _anomalyId = 1
function makeAnomaly({
  category, severity, jurisdiction, race, metric,
  expected, actual, deviation, zScore, n, confidence, direction,
  explanation, formula, assumptions, historicalValues, year, comparableType,
}) {
  return {
    id: `ANO-${String(_anomalyId++).padStart(5, '0')}`,
    category,
    severity,
    jurisdiction,
    race,
    metric,
    expected: typeof expected === 'number' ? parseFloat(expected.toFixed(4)) : expected,
    actual:   typeof actual   === 'number' ? parseFloat(actual.toFixed(4))   : actual,
    deviation:typeof deviation=== 'number' ? parseFloat(deviation.toFixed(4)): deviation,
    zScore:   zScore != null  ? parseFloat(zScore.toFixed(3)) : null,
    n,
    confidence,
    direction: direction || (deviation > 0 ? 'above' : 'below'),
    explanation,
    formula,
    assumptions,
    historicalValues: historicalValues || [],
    year,
    comparableType,
    flaggedAt: new Date().toISOString(),
  }
}

// ─── Category 1: Election Result Anomaly ─────────────────────────────────────

function detectElectionResultAnomalies(elections) {
  const anomalies = []

  // One O(n) pass: group candidate records by county||office||year
  const byCOY = groupBy(
    elections.filter(r => r.office !== 'BALLOT_TOTALS' && r.candidateParty),
    r => `${r.county}||${r.office}||${r.year}`
  )

  // Build county||office → [{year, records}] for O(1) prior-year access
  const byCO = new Map()
  for (const [key, records] of byCOY) {
    const lastPipe = key.lastIndexOf('||')
    const coKey    = key.slice(0, lastPipe)              // county||office
    const year     = parseInt(key.slice(lastPipe + 2))
    if (!byCO.has(coKey)) byCO.set(coKey, [])
    byCO.get(coKey).push({ year, records })
  }

  for (const [key, records] of byCOY) {
    const [county, office, yearStr] = key.split('||')
    const year           = parseInt(yearStr)
    const comparableType = records[0]?.comparableType || (year % 4 === 0 ? 'Presidential' : 'Midterm')

    // Prior comparable cycles — O(years per county-office), not O(n)
    const allForOffice = byCO.get(`${county}||${office}`) || []
    const priorData = allForOffice
      .filter(e => e.year < year && e.records[0]?.comparableType === comparableType)
      .sort((a, b) => a.year - b.year)
      .map(e => {
        const rV = sumVotes(e.records.filter(r => r.candidateParty === 'Republican'))
        const dV = sumVotes(e.records.filter(r => r.candidateParty === 'Democratic'))
        const t  = rV + dV
        return { year: e.year, share: t > 0 ? rV / t : null }
      })
      .filter(d => d.share != null)

    if (priorData.length < 2) continue

    const priorYears  = priorData.map(d => d.year)
    const priorShares = priorData.map(d => d.share)

    const rV = sumVotes(records.filter(r => r.candidateParty === 'Republican'))
    const dV = sumVotes(records.filter(r => r.candidateParty === 'Democratic'))
    const total = rV + dV
    if (total < 100) continue
    const curShare = rV / total

    const baselineMean = Statistics.mean(priorShares)
    const baselineSD   = Statistics.sampleStdDev(priorShares) || 0.02
    const z            = Statistics.zScore(curShare, baselineMean, baselineSD)
    const severity     = Statistics.stoplightFromZ(z)
    if (severity === 'GREEN') continue

    anomalies.push(makeAnomaly({
      category: 1, severity,
      jurisdiction: county,
      race: `${year} ${office}`,
      metric: 'Republican ballot share within race',
      expected: baselineMean, actual: curShare, deviation: curShare - baselineMean,
      zScore: z, n: priorShares.length,
      confidence: Statistics.confidenceScore(z, priorShares.length),
      explanation: `Republican candidate vote share in the ${office} race (${county} County, ${year}) deviated from the prior ${comparableType.toLowerCase()} cycle baseline by ${Math.abs(z).toFixed(2)} standard deviations. This is a statistical deviation requiring additional review and does not establish causation.`,
      formula: 'z = (observed_R_share − baseline_mean_R_share) / baseline_std_dev',
      assumptions: [
        `Baseline built from ${priorShares.length} prior ${comparableType.toLowerCase()} cycle(s): ${priorYears.join(', ')}`,
        'Republican and Democratic candidate votes used as proxies for ballot-type selection within this race',
        'Minimum 100 total votes required to flag',
      ],
      historicalValues: priorYears.map((y, i) => ({ year: y, value: priorShares[i] })),
      year, comparableType,
    }))
  }

  return anomalies
}

// ─── Category 2: Turnout Anomaly ─────────────────────────────────────────────

function detectTurnoutAnomalies(elections) {
  const anomalies = []

  // One O(n) pass: group BALLOT_TOTALS by county||year
  const byCY = groupBy(
    elections.filter(r => r.office === 'BALLOT_TOTALS'),
    r => `${r.county}||${r.year}`
  )

  // county → [{year, records}] for O(1) prior-year access
  const byCounty = new Map()
  for (const [key, records] of byCY) {
    const [county, yearStr] = key.split('||')
    if (!byCounty.has(county)) byCounty.set(county, [])
    byCounty.get(county).push({ year: parseInt(yearStr), records })
  }

  for (const [key, records] of byCY) {
    const [county, yearStr] = key.split('||')
    const year          = parseInt(yearStr)
    const rv            = records[0]?.registeredVoters || 0
    if (rv < 1000) continue

    const comparableType = records[0]?.comparableType || (year % 4 === 0 ? 'Presidential' : 'Midterm')
    const { total: curTotal } = ballotTotals(records)
    if (curTotal < 100) continue
    const curRate = curTotal / rv

    // Prior cycles — O(years per county), not O(n)
    const priorData = (byCounty.get(county) || [])
      .filter(e => e.year < year && e.records[0]?.comparableType === comparableType && e.records[0]?.registeredVoters > 0)
      .sort((a, b) => a.year - b.year)
      .map(e => {
        const { total } = ballotTotals(e.records)
        const rRV = e.records[0]?.registeredVoters || rv
        return { year: e.year, rate: rRV > 0 ? total / rRV : null }
      })
      .filter(d => d.rate != null)

    if (priorData.length < 2) continue

    const priorYears = priorData.map(d => d.year)
    const priorRates = priorData.map(d => d.rate)

    const mean = Statistics.mean(priorRates)
    const sd   = Statistics.sampleStdDev(priorRates) || 0.01
    const z    = Statistics.zScore(curRate, mean, sd)
    const severity = Statistics.stoplightFromZ(z)
    if (severity === 'GREEN') continue

    anomalies.push(makeAnomaly({
      category: 2, severity,
      jurisdiction: county,
      race: `${year} Primary`,
      metric: 'Primary ballot participation rate (total ballots / registered voters)',
      expected: mean, actual: curRate, deviation: curRate - mean,
      zScore: z, n: priorRates.length,
      confidence: Statistics.confidenceScore(z, priorRates.length),
      explanation: `Total primary ballot participation in ${county} County (${year}) was ${(curRate * 100).toFixed(1)}% of registered voters, compared to a historical ${comparableType.toLowerCase()} cycle baseline of ${(mean * 100).toFixed(1)}%. This deviation (${Math.abs(z).toFixed(2)}σ) warrants additional review.`,
      formula: 'turnout_rate = total_ballots / registered_voters; z = (observed − mean) / std_dev',
      assumptions: [
        'Registered voters from county metadata (used only as turnout denominator)',
        'Georgia has no party registration — registered voter count is not partisan',
        `Baseline from ${priorRates.length} prior ${comparableType.toLowerCase()} cycle(s): ${priorYears.join(', ')}`,
      ],
      historicalValues: priorYears.map((y, i) => ({ year: y, value: priorRates[i] })),
      year, comparableType,
    }))
  }

  return anomalies
}

// ─── Category 3: Ballot-Selection Anomaly ─────────────────────────────────────

function detectBallotSelectionAnomalies(elections) {
  const anomalies = []

  const byCY = groupBy(
    elections.filter(r => r.office === 'BALLOT_TOTALS'),
    r => `${r.county}||${r.year}`
  )

  const byCounty = new Map()
  for (const [key, records] of byCY) {
    const [county, yearStr] = key.split('||')
    if (!byCounty.has(county)) byCounty.set(county, [])
    byCounty.get(county).push({ year: parseInt(yearStr), records })
  }

  for (const [key, records] of byCY) {
    const [county, yearStr] = key.split('||')
    const year           = parseInt(yearStr)
    const comparableType = records[0]?.comparableType || (year % 4 === 0 ? 'Presidential' : 'Midterm')
    const curShare       = rShare(records)
    if (curShare == null) continue

    const priorData = (byCounty.get(county) || [])
      .filter(e => e.year < year && e.records[0]?.comparableType === comparableType)
      .sort((a, b) => a.year - b.year)
      .map(e => ({ year: e.year, share: rShare(e.records) }))
      .filter(d => d.share != null)

    if (priorData.length < 2) continue

    const priorYears  = priorData.map(d => d.year)
    const priorShares = priorData.map(d => d.share)

    const mean = Statistics.mean(priorShares)
    const sd   = Statistics.sampleStdDev(priorShares) || 0.015
    const z    = Statistics.zScore(curShare, mean, sd)
    const severity = Statistics.stoplightFromZ(z)
    if (severity === 'GREEN') continue

    anomalies.push(makeAnomaly({
      category: 3, severity,
      jurisdiction: county,
      race: `${year} Primary (All Offices)`,
      metric: 'Republican ballot share (R ballots / total ballots)',
      expected: mean, actual: curShare, deviation: curShare - mean,
      zScore: z, n: priorShares.length,
      confidence: Statistics.confidenceScore(z, priorShares.length),
      explanation: `Republican ballot selection in ${county} County (${year}) was ${(curShare * 100).toFixed(1)}%, compared to a ${comparableType.toLowerCase()} historical baseline of ${(mean * 100).toFixed(1)}%. The deviation of ${Math.abs(z).toFixed(2)}σ is a possible behavior change indicator. No cause is determined by this analysis.`,
      formula: 'R_share = R_ballots / (R_ballots + D_ballots); z = (observed − mean) / std_dev',
      assumptions: [
        'Ballot-type totals sourced from BALLOT_TOTALS records',
        'Georgia open primary: voters self-select ballot type; this measures observed behavior, not party affiliation',
        `Comparable cycle baseline: ${priorYears.join(', ')} (${comparableType.toLowerCase()} elections only)`,
      ],
      historicalValues: priorYears.map((y, i) => ({ year: y, value: priorShares[i] })),
      year, comparableType,
    }))
  }

  return anomalies
}

// ─── Category 4: Vote-Method Anomaly ──────────────────────────────────────────

function detectVoteMethodAnomalies(elections) {
  const anomalies = []

  // R-ballot BALLOT_TOTALS only
  const byCY = groupBy(
    elections.filter(r => r.office === 'BALLOT_TOTALS' && r.ballotType === 'Republican'),
    r => `${r.county}||${r.year}`
  )

  const byCounty = new Map()
  for (const [key, records] of byCY) {
    const [county, yearStr] = key.split('||')
    if (!byCounty.has(county)) byCounty.set(county, [])
    byCounty.get(county).push({ year: parseInt(yearStr), records })
  }

  for (const [key, records] of byCY) {
    const [county, yearStr] = key.split('||')
    const year           = parseInt(yearStr)
    const comparableType = records[0]?.comparableType || 'Midterm'

    const totR = sumVotes(records)
    if (totR < 200) continue
    const absPct = records.reduce((s, r) => s + (r.absenteeVotes || 0), 0) / totR

    const priorData = (byCounty.get(county) || [])
      .filter(e => e.year < year && e.records[0]?.comparableType === comparableType)
      .sort((a, b) => a.year - b.year)
      .map(e => {
        const tot = sumVotes(e.records)
        return { year: e.year, pct: tot > 0 ? e.records.reduce((s, r) => s + (r.absenteeVotes || 0), 0) / tot : null }
      })
      .filter(d => d.pct != null)

    if (priorData.length < 2) continue

    const priorYears   = priorData.map(d => d.year)
    const priorAbsPcts = priorData.map(d => d.pct)

    const mean = Statistics.mean(priorAbsPcts)
    const sd   = Statistics.sampleStdDev(priorAbsPcts) || 0.02
    const z    = Statistics.zScore(absPct, mean, sd)
    const severity = Statistics.stoplightFromZ(z)
    if (severity === 'GREEN') continue

    anomalies.push(makeAnomaly({
      category: 4, severity,
      jurisdiction: county,
      race: `${year} Primary — Republican Ballots`,
      metric: 'Absentee ballot fraction (absentee / total R ballots)',
      expected: mean, actual: absPct, deviation: absPct - mean,
      zScore: z, n: priorAbsPcts.length,
      confidence: Statistics.confidenceScore(z, priorAbsPcts.length),
      explanation: `Absentee ballot fraction for Republican ballot selections in ${county} County (${year}) was ${(absPct * 100).toFixed(1)}%, compared to a historical baseline of ${(mean * 100).toFixed(1)}%. This vote-method shift is a statistical deviation requiring additional review.`,
      formula: 'absentee_pct = absentee_votes / total_R_ballots; z = (observed − mean) / std_dev',
      assumptions: [
        'Only Republican ballot records used for this calculation',
        'Absentee ballot rules may change between cycles (verify legislative context)',
        `Baseline from cycles: ${priorYears.join(', ')}`,
      ],
      historicalValues: priorYears.map((y, i) => ({ year: y, value: priorAbsPcts[i] })),
      year, comparableType,
    }))
  }

  return anomalies
}

// ─── Category 5: Roll-Off Anomaly ────────────────────────────────────────────

function detectRollOffAnomalies(elections) {
  const anomalies = []

  const candRecs = elections.filter(r => r.office !== 'BALLOT_TOTALS' && r.candidateParty)

  // Pre-sum votes: county||year||party||office → total votes
  // Eliminates two O(n) elections.filter() calls per inner iteration
  const voteMap = new Map()
  for (const r of candRecs) {
    if (!r.county || !r.year || !r.office) continue
    const k = `${r.county}||${r.year}||${r.candidateParty}||${r.office}`
    voteMap.set(k, (voteMap.get(k) || 0) + (r.votes || 0))
  }

  // Group by county||year||party for the outer loop
  const byCYP = groupBy(candRecs, r => `${r.county}||${r.year}||${r.candidateParty}`)

  // Pre-build sorted office lists and comparableType per county||year||party
  const sortedOfficesMap = new Map() // county||year||party → {sorted:[{office,votes}], comparableType}
  for (const [key, records] of byCYP) {
    const [county, yearStr, party] = key.split('||')
    const officeVotes = new Map()
    for (const r of records) {
      officeVotes.set(r.office, (officeVotes.get(r.office) || 0) + (r.votes || 0))
    }
    const sorted = [...officeVotes.entries()]
      .map(([office, votes]) => ({ office, votes }))
      .sort((a, b) => b.votes - a.votes)
    sortedOfficesMap.set(key, {
      sorted,
      comparableType: records[0]?.comparableType || (parseInt(yearStr) % 4 === 0 ? 'Presidential' : 'Midterm'),
    })
  }

  // Build county||party → [{year, comparableType}] for O(1) prior-year lookup
  const yearsByCPart = new Map()
  for (const [key, { comparableType }] of sortedOfficesMap) {
    const [county, yearStr, party] = key.split('||')
    const cpKey = `${county}||${party}`
    if (!yearsByCPart.has(cpKey)) yearsByCPart.set(cpKey, [])
    yearsByCPart.get(cpKey).push({ year: parseInt(yearStr), comparableType })
  }

  for (const [key, { sorted, comparableType }] of sortedOfficesMap) {
    const [county, yearStr, party] = key.split('||')
    const year = parseInt(yearStr)

    if (sorted.length < 2) continue
    const topOffice = sorted[0].office
    const topVotes  = sorted[0].votes
    if (topVotes < 200) continue

    // Prior years for this county||party with matching comparableType — O(years), not O(n)
    const cpKey      = `${county}||${party}`
    const priorYears = (yearsByCPart.get(cpKey) || [])
      .filter(e => e.year < year && e.comparableType === comparableType)
      .sort((a, b) => a.year - b.year)

    for (let i = 1; i < sorted.length; i++) {
      const { office, votes } = sorted[i]
      const rollOff = 1 - votes / topVotes

      // All prior lookups are O(1) Map.get() — no elections.filter() here
      const priorRollOffData = priorYears.map(({ year: py }) => {
        const topV = voteMap.get(`${county}||${py}||${party}||${topOffice}`) || 0
        const offV = voteMap.get(`${county}||${py}||${party}||${office}`)   || 0
        return { year: py, value: topV > 0 ? 1 - offV / topV : null }
      })
      const priorRollOffs = priorRollOffData.map(d => d.value).filter(v => v != null)

      if (priorRollOffs.length < 2) continue

      const mean = Statistics.mean(priorRollOffs)
      const sd   = Statistics.sampleStdDev(priorRollOffs) || 0.02
      const z    = Statistics.zScore(rollOff, mean, sd)
      const severity = Statistics.stoplightFromZ(z)
      if (severity === 'GREEN') continue

      anomalies.push(makeAnomaly({
        category: 5, severity,
        jurisdiction: county,
        race: `${year} ${office} (${party} ballot)`,
        metric: `Roll-off from top race to ${office}`,
        expected: mean, actual: rollOff, deviation: rollOff - mean,
        zScore: z, n: priorRollOffs.length,
        confidence: Statistics.confidenceScore(z, priorRollOffs.length),
        explanation: `Ballot roll-off on the ${party} ballot from the top race to ${office} in ${county} County (${year}) was ${(rollOff * 100).toFixed(1)}%, compared to a historical baseline of ${(mean * 100).toFixed(1)}%. This deviation (${Math.abs(z).toFixed(2)}σ) may reflect candidate competitiveness, ballot design, or other factors.`,
        formula: 'roll_off = 1 − (lower_office_votes / top_office_votes); z = (observed − mean) / std_dev',
        assumptions: [
          `Top race identified as highest-vote office: "${topOffice}"`,
          'Roll-off measured separately for each ballot type',
          `Baseline from cycles: ${priorYears.map(e => e.year).join(', ')}`,
        ],
        historicalValues: priorRollOffData.filter(d => d.value != null).map(d => ({ year: d.year, value: d.value })),
        year, comparableType,
      }))
    }
  }

  return anomalies
}

// ─── Category 6: Precinct-Level Anomaly ──────────────────────────────────────

function detectPrecinctAnomalies(elections) {
  const anomalies = []
  const byCountyYear = groupBy(
    elections.filter(r => r.office === 'BALLOT_TOTALS' && r.precinct),
    r => `${r.county}||${r.year}`
  )

  for (const [key, records] of byCountyYear) {
    const [county, yearStr] = key.split('||')
    const year = parseInt(yearStr)

    const byPrecinct = groupBy(records, r => r.precinct)
    const precinctShares = []
    for (const [precinct, pRecs] of byPrecinct) {
      const s = rShare(pRecs)
      if (s != null) precinctShares.push({ precinct, share: s })
    }

    if (precinctShares.length < 4) continue
    const shares = precinctShares.map(p => p.share)
    const mean   = Statistics.mean(shares)
    const sd     = Statistics.stdDev(shares)
    if (!sd || sd < 0.001) continue

    for (const { precinct, share } of precinctShares) {
      const z        = Statistics.zScore(share, mean, sd)
      const severity = Statistics.stoplightFromZ(z)
      if (severity === 'GREEN') continue

      anomalies.push(makeAnomaly({
        category: 6, severity,
        jurisdiction: `${county} — ${precinct}`,
        race: `${year} Primary`,
        metric: 'Precinct R ballot share vs. county mean',
        expected: mean, actual: share, deviation: share - mean,
        zScore: z, n: precinctShares.length,
        confidence: Statistics.confidenceScore(z, precinctShares.length),
        explanation: `Precinct "${precinct}" in ${county} County (${year}) showed a Republican ballot share of ${(share * 100).toFixed(1)}%, which is ${Math.abs(z).toFixed(2)}σ from the county mean of ${(mean * 100).toFixed(1)}%. This is a within-county precinct deviation flag.`,
        formula: 'z = (precinct_R_share − county_mean_R_share) / county_std_dev_R_share',
        assumptions: [
          'Deviation is relative to within-cycle county mean, not historical baseline',
          'Minimum 4 precincts required to generate county distribution',
          'Precinct boundaries may change between cycles',
        ],
        historicalValues: [],
        year,
        comparableType: records[0]?.comparableType,
      }))
    }
  }

  return anomalies
}

// ─── Category 7: Contextual Anomaly ──────────────────────────────────────────

function detectContextualAnomalies(elections, contextualData) {
  const anomalies = []
  if (!contextualData || Object.keys(contextualData).length === 0) return anomalies

  const byCY = groupBy(
    elections.filter(r => r.office === 'BALLOT_TOTALS'),
    r => `${r.county}||${r.year}`
  )

  const byCounty = new Map()
  for (const [key, records] of byCY) {
    const [county, yearStr] = key.split('||')
    if (!byCounty.has(county)) byCounty.set(county, [])
    byCounty.get(county).push({ year: parseInt(yearStr), records })
  }

  for (const [key, records] of byCY) {
    const [county, yearStr] = key.split('||')
    const year   = parseInt(yearStr)
    const ctx    = contextualData[`${county}::${year}`]
    if (!ctx) continue

    const comparableType = records[0]?.comparableType || (year % 4 === 0 ? 'Presidential' : 'Midterm')
    const { total }  = ballotTotals(records)
    const totalReg   = ctx.totalRegistered || ctx.activeVoters
    if (!totalReg || totalReg < 1000) continue

    const turnout = total / totalReg

    // Prior years — O(years per county), not O(n)
    const priorData = (byCounty.get(county) || [])
      .filter(e => e.year < year && e.records[0]?.comparableType === comparableType)
      .sort((a, b) => a.year - b.year)
      .map(e => {
        const yCtx = contextualData[`${county}::${e.year}`]
        const yReg = yCtx?.totalRegistered || yCtx?.activeVoters || records[0]?.registeredVoters || totalReg
        const { total: yTotal } = ballotTotals(e.records)
        return { year: e.year, rate: yReg > 0 ? yTotal / yReg : null }
      })
      .filter(d => d.rate != null)

    if (priorData.length < 2) continue

    const priorYears = priorData.map(d => d.year)
    const priorRates = priorData.map(d => d.rate)

    const mean = Statistics.mean(priorRates)
    const sd   = Statistics.sampleStdDev(priorRates) || 0.015
    const z    = Statistics.zScore(turnout, mean, sd)
    const severity = Statistics.stoplightFromZ(z)
    if (severity === 'GREEN') continue

    anomalies.push(makeAnomaly({
      category: 7, severity,
      jurisdiction: county,
      race: `${year} Primary`,
      metric: 'Turnout rate (ballots / contextual registered voter count)',
      expected: mean, actual: turnout, deviation: turnout - mean,
      zScore: z, n: priorRates.length,
      confidence: Statistics.confidenceScore(z, priorRates.length),
      explanation: `Using supplemental voter registration data for ${county} County, the ${year} primary turnout rate of ${(turnout * 100).toFixed(1)}% deviates ${Math.abs(z).toFixed(2)}σ from the contextual historical baseline of ${(mean * 100).toFixed(1)}%. Registered voter count is used only as a denominator and carries no partisan interpretation in Georgia.`,
      formula: 'turnout = total_ballots / contextual_registered_voters; z = (observed − mean) / std_dev',
      assumptions: [
        'Contextual registered voter data sourced from supplemental import',
        'Georgia voter registration is non-partisan — used only as turnout denominator',
        'Active + inactive voters may differ from total registration (verify with source)',
        `Baseline from: ${priorYears.join(', ')}`,
      ],
      historicalValues: priorYears.map((y, i) => ({ year: y, value: priorRates[i] })),
      year, comparableType,
    }))
  }

  return anomalies
}

// ─── Multi-Category Flag Escalation ──────────────────────────────────────────

function escalateMultiCategory(anomalies) {
  const byJurisdictionYear = groupBy(anomalies, a => `${a.jurisdiction}||${a.year}`)
  for (const [, group] of byJurisdictionYear) {
    const yellows    = group.filter(a => a.severity === 'YELLOW').length
    const uniqueCats = new Set(group.filter(a => a.severity === 'YELLOW').map(a => a.category)).size
    if (yellows >= 3 || (uniqueCats >= 2 && yellows >= 2)) {
      for (const a of group) {
        if (a.severity === 'YELLOW') {
          a.severity = 'RED'
          a.explanation += ' NOTE: Severity escalated to RED because multiple anomaly categories triggered simultaneously in this jurisdiction/cycle.'
        }
      }
    }
  }
  return anomalies
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export function runAnomalyAnalysis(elections, contextualData = {}) {
  if (!elections?.length) return []
  const t0 = performance.now()
  _anomalyId = 1

  const t1 = performance.now()
  const r1 = detectElectionResultAnomalies(elections)
  console.debug(`[Perf] AnomalyEngine Cat1 (election results):   ${(performance.now() - t1).toFixed(1)}ms → ${r1.length}`)

  const t2 = performance.now()
  const r2 = detectTurnoutAnomalies(elections)
  console.debug(`[Perf] AnomalyEngine Cat2 (turnout):            ${(performance.now() - t2).toFixed(1)}ms → ${r2.length}`)

  const t3 = performance.now()
  const r3 = detectBallotSelectionAnomalies(elections)
  console.debug(`[Perf] AnomalyEngine Cat3 (ballot selection):   ${(performance.now() - t3).toFixed(1)}ms → ${r3.length}`)

  const t4 = performance.now()
  const r4 = detectVoteMethodAnomalies(elections)
  console.debug(`[Perf] AnomalyEngine Cat4 (vote method):        ${(performance.now() - t4).toFixed(1)}ms → ${r4.length}`)

  const t5 = performance.now()
  const r5 = detectRollOffAnomalies(elections)
  console.debug(`[Perf] AnomalyEngine Cat5 (roll-off):           ${(performance.now() - t5).toFixed(1)}ms → ${r5.length}`)

  const t6 = performance.now()
  const r6 = detectPrecinctAnomalies(elections)
  console.debug(`[Perf] AnomalyEngine Cat6 (precinct):           ${(performance.now() - t6).toFixed(1)}ms → ${r6.length}`)

  const t7 = performance.now()
  const r7 = detectContextualAnomalies(elections, contextualData)
  console.debug(`[Perf] AnomalyEngine Cat7 (contextual):         ${(performance.now() - t7).toFixed(1)}ms → ${r7.length}`)

  const result = escalateMultiCategory([...r1, ...r2, ...r3, ...r4, ...r5, ...r6, ...r7])
    .sort((a, b) => {
      const order = { RED: 0, YELLOW: 1, GREEN: 2 }
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
    })

  console.debug(`[Perf] AnomalyEngine total: ${(performance.now() - t0).toFixed(1)}ms → ${result.length} anomalies (${elections.length} records)`)
  return result
}

// ─── Engine Metadata (for Methodology tab) ────────────────────────────────────

export const ENGINE_METADATA = {
  version: '1.0.0',
  description: 'Statistical anomaly detection for Georgia open primary election data. Identifies measurable deviations from historical baselines. Does not determine causation.',
  thresholds: {
    GREEN:  '|z| < 2.0 standard deviations from historical baseline',
    YELLOW: '2.0 ≤ |z| < 3.0, or moderate threshold breach',
    RED:    '|z| ≥ 3.0, or simultaneous multi-category flags',
    escalation: 'YELLOW → RED when ≥3 YELLOW flags in same jurisdiction/cycle, or ≥2 YELLOW flags in different anomaly categories',
  },
  baselineMethod: 'Mean and sample standard deviation of prior comparable election cycles (presidential vs. presidential, midterm vs. midterm)',
  minimumBaseline: 'Minimum 2 prior comparable cycles required to flag; flags with n<3 carry lower confidence scores',
  confidenceFormula: 'confidence = 0.6 × min(1, (n−1)/4) + 0.4 × min(1, |z|/4)',
  neutralityGuarantee: 'No narrative framing. Findings state only: jurisdiction, metric, expected value, observed value, deviation, z-score. Causation is not inferred.',
  categories: [
    { id: 1, name: 'Election Result Anomaly',  description: 'Candidate vote share within a race deviates from comparable prior cycles' },
    { id: 2, name: 'Turnout Anomaly',          description: 'Total ballot participation rate relative to registered voters' },
    { id: 3, name: 'Ballot-Selection Anomaly', description: 'Share of Republican vs. Democratic ballots selected by primary voters' },
    { id: 4, name: 'Vote-Method Anomaly',      description: 'Fraction of absentee, early, or Election Day votes by ballot type' },
    { id: 5, name: 'Roll-Off Anomaly',         description: 'Drop in participation from top race to lower races on the same ballot' },
    { id: 6, name: 'Precinct-Level Anomaly',   description: 'A precinct deviates from its county\'s within-cycle distribution' },
    { id: 7, name: 'Contextual Anomaly',       description: 'Turnout relative to supplemental voter registration context data' },
  ],
}
