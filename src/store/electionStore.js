// Georgia Open Primary Intelligence Dashboard — Election Store
//
// Data policy:
//   - No synthetic, seeded, or estimated data is ever generated here.
//   - The store initializes empty. All data must arrive through user import.
//   - Historical records from IndexedDB are restored on load but are never
//     supplemented with generated values.
//   - Missing data is surfaced as null, not estimated.
//
// Persistence: IndexedDB via idbCache (not localStorage).
// localStorage is capped at 5–10 MB; 35k+ election records exceed that limit,
// causing silent QuotaExceededError and data loss on restart.

import { create } from 'zustand'
import { discoverDimensions, createSnapshot } from '../services/GeorgiaElectionService.js'
import { runAnomalyAnalysis } from '../services/AnomalyEngine.js'
import { Statistics } from '../services/StatisticsService.js'
import { idbGet, idbSet, idbDelete } from './idbCache.js'
import { COUNTY_BY_NAME } from '../data/georgiaCounties.js'

// ─── County derivation from precinct names ────────────────────────────────────
// Georgia SOS Clarity Elections precinct names commonly follow these patterns:
//   "FULTON - 001"   →  FULTON
//   "FULTON-001A"    →  FULTON
//   "FULTON 001"     →  FULTON
//   "BEN HILL - 02"  →  BEN HILL  (multi-word county)
// Sorted by descending name length so "BEN HILL" matches before "BEN".
const COUNTY_KEYS_LONG_FIRST = Object.keys(COUNTY_BY_NAME).sort((a, b) => b.length - a.length)

function deriveCountyFromPrecinct(precinctName) {
  if (!precinctName || precinctName === 'MISSING_DATA') return null
  const s = precinctName.toString().trim().toUpperCase()

  // Pattern: "COUNTYNAME - ..." or "COUNTYNAME– ..." (with or without spaces)
  const dashMatch = s.match(/^([A-Z][A-Z\s]*?)\s*[-–—]\s*\S/)
  if (dashMatch) {
    const candidate = dashMatch[1].trim()
    if (COUNTY_BY_NAME[candidate]) return COUNTY_BY_NAME[candidate].name
  }

  // Pattern: starts with a known county name followed by a space or digit
  for (const key of COUNTY_KEYS_LONG_FIRST) {
    if (s.startsWith(key)) {
      const rest = s.slice(key.length)
      if (!rest || /^[\s\-–—\d(]/.test(rest)) {
        return COUNTY_BY_NAME[key].name
      }
    }
  }

  return null
}

// Post-normalization enrichment: fills county (and FIPS) for records that have
// a precinct but no county. Returns a new array; input records are never mutated.
function enrichMissingCounties(records) {
  let anyChanged = false
  const result = records.map(r => {
    if (r.county && r.county !== 'MISSING_DATA' && r.county !== 'Unknown') return r
    if (!r.precinct || r.precinct === 'MISSING_DATA') return r
    const derived = deriveCountyFromPrecinct(r.precinct)
    if (!derived) return r
    const fips = COUNTY_BY_NAME[derived.toUpperCase()]?.fips || r.fips
    anyChanged = true
    return { ...r, county: derived, fips }
  })
  return { records: result, changed: anyChanged }
}

// ─── Derived Selectors ────────────────────────────────────────────────────────

// Module-level lazy cache for county summaries — avoids recomputing O(n×counties)
// inside the render cycle. Invalidated by reference comparison when elections changes.
let _proxyByYear = null
let _csCache     = { electionsRef: null, byYear: {} }

// ── Proxy-contest selection ──────────────────────────────────────────────────
// Georgia SOS exports contain per-candidate, per-office rows. Summing all
// candidate rows inflates totals — a voter casts one ballot but appears in
// every race they voted in (typically 5-10 per ballot). Fix: pick the
// highest-turnout statewide contest per party/year as the ballot-total proxy.
const PREFERRED_OFFICES = [
  'governor',
  'lieutenant governor',
  'secretary of state',
  'attorney general',
  'u.s. senate',
  'us senate',
  'president',
]

function officePreferenceRank(officeName) {
  const lc = (officeName || '').toLowerCase()
  const idx = PREFERRED_OFFICES.findIndex(p => lc.includes(p))
  return idx === -1 ? 999 : idx
}

// Returns Map<year, { R: {office,votes} | null, D: {office,votes} | null }>
function selectProxyContests(elections) {
  const acc = {}
  for (const r of elections) {
    const year = r.year
    if (typeof year !== 'number' || isNaN(year)) continue
    const votes = Number(r.votes)
    if (isNaN(votes) || votes < 0) continue
    const party = r.ballotType || r.candidateParty
    if (party !== 'Republican' && party !== 'Democratic') continue
    if (!r.office || r.office === 'MISSING_DATA' || r.office === 'BALLOT_TOTALS') continue
    if (!acc[year])        acc[year] = {}
    if (!acc[year][party]) acc[year][party] = {}
    acc[year][party][r.office] = (acc[year][party][r.office] || 0) + votes
  }
  const proxyByYear = new Map()
  for (const [yearStr, parties] of Object.entries(acc)) {
    const year = Number(yearStr)
    const yearProxy = { R: null, D: null }
    for (const [party, offices] of Object.entries(parties)) {
      const key = party === 'Republican' ? 'R' : 'D'
      let best = null
      for (const [office, votes] of Object.entries(offices)) {
        const rank = officePreferenceRank(office)
        if (!best || rank < best.rank || (rank === best.rank && votes > best.votes))
          best = { office, votes, rank }
      }
      yearProxy[key] = best
    }
    proxyByYear.set(year, yearProxy)
  }
  return proxyByYear
}

function buildStatewideTimeline(elections, _proxy) {
  const proxyByYear = _proxy || selectProxyContests(elections)
  const byYear      = new Map()

  for (const r of elections) {
    const year = r.year
    if (typeof year !== 'number' || isNaN(year)) continue
    const party = r.ballotType || r.candidateParty
    if (party !== 'Republican' && party !== 'Democratic') continue
    const proxy = proxyByYear.get(year)
    if (!proxy) continue
    // Only count rows belonging to this year's proxy contest for their party
    if (party === 'Republican' && proxy.R && r.office !== proxy.R.office) continue
    if (party === 'Democratic' && proxy.D && r.office !== proxy.D.office) continue
    const votes = Number(r.votes)
    if (isNaN(votes) || votes < 0) continue

    if (!byYear.has(year)) {
      byYear.set(year, {
        year,
        R: 0, D: 0, total: 0,
        registeredVoters: 0,
        electionType:   r.electionType   !== 'MISSING_DATA' ? r.electionType   : null,
        comparableType: r.comparableType !== 'MISSING_DATA' ? r.comparableType : null,
        rProxy: proxy.R?.office || null,
        dProxy: proxy.D?.office || null,
      })
    }
    const row = byYear.get(year)
    if (party === 'Republican') row.R += votes
    if (party === 'Democratic') row.D += votes
    if (r.registeredVoters > 0) row.registeredVoters = Math.max(row.registeredVoters, r.registeredVoters)
    if (!row.electionType   && r.electionType   !== 'MISSING_DATA') row.electionType   = r.electionType
    if (!row.comparableType && r.comparableType !== 'MISSING_DATA') row.comparableType = r.comparableType
  }

  const sorted = [...byYear.values()].sort((a, b) => a.year - b.year)

  // Pass 1: shares and display fields — O(years)
  for (const row of sorted) {
    row.total      = row.R + row.D
    row.rShare     = row.total > 0 ? row.R / row.total : null
    row.dShare     = row.total > 0 ? row.D / row.total : null
    row.turnout    = (row.registeredVoters > 0 && row.total > 0)
      ? row.total / row.registeredVoters : null
    row.yearLabel  = String(row.year)
    row.rSharePct  = row.rShare != null ? row.rShare * 100 : null
    row.dSharePct  = row.dShare != null ? row.dShare * 100 : null
  }

  // Pass 2: shift vs. prior comparable cycle — O(years²), years ≤ ~20
  for (let i = 0; i < sorted.length; i++) {
    const row  = sorted[i]
    const prev = sorted.slice(0, i).filter(d => d.comparableType === row.comparableType).at(-1)
    row.rShift = (prev?.rSharePct != null && row.rSharePct != null) ? row.rSharePct - prev.rSharePct : null
    row.dShift = (prev?.dSharePct != null && row.dSharePct != null) ? row.dSharePct - prev.dSharePct : null
  }

  return sorted
}

function buildCountySummary(elections, targetYear, proxyByYear) {
  if (!elections.length || !targetYear) return []

  const proxy      = proxyByYear?.get(targetYear) || { R: null, D: null }
  const yearPrefix = `${targetYear}|`

  // Pre-group all R/D records by 'year|county' in a single O(n) pass.
  // This converts the priorShares inner loop from O(n) per county per year
  // down to O(records_per_county_per_year) — total complexity becomes O(n).
  const grouped = new Map()
  for (const r of elections) {
    if (!r.county || r.county === 'MISSING_DATA' || r.county === 'Unknown') continue
    if (typeof r.year !== 'number' || isNaN(r.year)) continue
    const party = r.ballotType || r.candidateParty
    if (party !== 'Republican' && party !== 'Democratic') continue
    const key = `${r.year}|${r.county}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(r)
  }

  // Build current-year county totals from the pre-grouped map
  const byCounty = new Map()
  for (const [key, recs] of grouped) {
    if (!key.startsWith(yearPrefix)) continue
    const county = key.slice(yearPrefix.length)
    for (const r of recs) {
      const party = r.ballotType || r.candidateParty
      if (party === 'Republican' && proxy.R && r.office !== proxy.R.office) continue
      if (party === 'Democratic' && proxy.D && r.office !== proxy.D.office) continue
      const votes = Number(r.votes)
      if (isNaN(votes) || votes < 0) continue
      if (!byCounty.has(county)) {
        byCounty.set(county, { county, fips: r.fips, R: 0, D: 0, registeredVoters: 0, year: targetYear })
      }
      const row = byCounty.get(county)
      if (party === 'Republican') row.R += votes
      if (party === 'Democratic') row.D += votes
      if (r.registeredVoters > 0) row.registeredVoters = Math.max(row.registeredVoters, r.registeredVoters)
    }
  }

  // Precinct fallback: if the year has no county-level records, aggregate by precinct
  if (byCounty.size === 0) {
    for (const r of elections) {
      if (r.year !== targetYear) continue
      if (!r.precinct || r.precinct === 'MISSING_DATA') continue
      const party = r.ballotType || r.candidateParty
      if (party === 'Republican' && proxy.R && r.office !== proxy.R.office) continue
      if (party === 'Democratic' && proxy.D && r.office !== proxy.D.office) continue
      if (party !== 'Republican' && party !== 'Democratic') continue
      const votes = Number(r.votes)
      if (isNaN(votes) || votes < 0) continue
      if (!byCounty.has(r.precinct)) {
        byCounty.set(r.precinct, { county: r.precinct, fips: null, R: 0, D: 0, registeredVoters: 0, year: targetYear })
      }
      const row = byCounty.get(r.precinct)
      if (party === 'Republican') row.R += votes
      if (party === 'Democratic') row.D += votes
    }
  }

  const yearMeta = elections.find(e => e.year === targetYear && e.comparableType && e.comparableType !== 'MISSING_DATA')
  const comparableType = yearMeta?.comparableType || (targetYear % 4 === 0 ? 'Presidential' : 'Midterm')

  const priorYears = [...new Set(
    elections.filter(e =>
      typeof e.year === 'number' &&
      e.year < targetYear &&
      e.comparableType === comparableType &&
      e.county && e.county !== 'MISSING_DATA'
    ).map(e => e.year)
  )].sort().slice(-3)

  const result = []
  for (const [county, row] of byCounty) {
    const total  = row.R + row.D
    const rShare = total > 0 ? row.R / total : null
    const turnout = (row.registeredVoters > 0 && total > 0) ? total / row.registeredVoters : null

    // priorShares uses grouped map for O(county_records) per lookup instead of O(n)
    const priorShares = priorYears.map(py => {
      const pyProxy = proxyByYear?.get(py) || { R: null, D: null }
      const pyRecs  = grouped.get(`${py}|${county}`) || []
      let pR = 0, pD = 0
      for (const r of pyRecs) {
        const party = r.ballotType || r.candidateParty
        if (party === 'Republican') {
          if (pyProxy.R && r.office !== pyProxy.R.office) continue
          const v = Number(r.votes || 0); if (!isNaN(v)) pR += v
        } else {
          if (pyProxy.D && r.office !== pyProxy.D.office) continue
          const v = Number(r.votes || 0); if (!isNaN(v)) pD += v
        }
      }
      const pT = pR + pD
      return pT > 0 ? pR / pT : null
    }).filter(v => v != null)

    const baseline = priorShares.length >= 2 ? Statistics.mean(priorShares) : null
    const shift    = (baseline != null && rShare != null) ? rShare - baseline : null
    const sd       = priorShares.length >= 2 ? (Statistics.sampleStdDev(priorShares) || 0.01) : null
    const z        = (baseline != null && sd != null && rShare != null)
      ? Statistics.zScore(rShare, baseline, sd)
      : null

    result.push({
      ...row,
      total,
      rShare,
      dShare: rShare != null ? 1 - rShare : null,
      turnout,
      baseline,
      shift,
      zScore: z,
      severity: z != null ? Statistics.stoplightFromZ(z) : null,
      priorYears,
      priorShares,
      baselineAvailable: priorShares.length >= 2,
    })
  }

  return result.sort((a, b) => a.county.localeCompare(b.county))
}

function buildRolloffData(elections, filters = {}) {
  const targetYear = filters.year || (elections.length ? Math.max(...elections.map(r => r.year)) : null)
  if (!targetYear) return []

  const recs = elections.filter(r => r.year === targetYear && r.office !== 'BALLOT_TOTALS')
  const officeVotes = new Map()

  for (const r of recs) {
    if (!officeVotes.has(r.office)) officeVotes.set(r.office, { R: 0, D: 0 })
    const row = officeVotes.get(r.office)
    if (r.candidateParty === 'Republican') row.R += r.votes
    if (r.candidateParty === 'Democratic') row.D += r.votes
  }

  const sorted = [...officeVotes.entries()]
    .map(([office, v]) => ({ office, ...v, total: v.R + v.D }))
    .sort((a, b) => b.total - a.total)

  if (!sorted.length) return []
  const topTotal = sorted[0].total || 1
  return sorted.map(row => ({
    ...row,
    rolloff:    1 - row.total / topTotal,
    rolloffPct: (1 - row.total / topTotal) * 100,
  }))
}

// ─── Precompute helper ────────────────────────────────────────────────────────
// Called once after elections change. Returns derived slices that go into store
// state so components get O(1) reads instead of O(n) per render.
function recomputeDerived(elections) {
  const t0 = performance.now()
  // Store proxy in module scope so getCountySummary can reference it without recomputing
  _proxyByYear = selectProxyContests(elections)
  // Invalidate lazy county-summary cache whenever elections reference changes
  _csCache = { electionsRef: elections, byYear: {} }
  console.debug(`[Perf] selectProxyContests: ${(performance.now() - t0).toFixed(1)}ms (${elections.length} records)`)

  const t1 = performance.now()
  const statewideTimeline = buildStatewideTimeline(elections, _proxyByYear)
  console.debug(`[Perf] buildStatewideTimeline: ${(performance.now() - t1).toFixed(1)}ms → ${statewideTimeline.length} years`)

  // County summaries are NOT precomputed here — they are O(n×counties) and computed
  // lazily on first access via getCountySummary(), then cached in _csCache.
  return { statewideTimeline }
}

// ─── Store ────────────────────────────────────────────────────────────────────

const useElectionStore = create((set, get) => ({
  // ── Data ─────────────────────────────────────────────────────────────────
  elections:      [],   // normalized election records from imports only
  snapshots:      [],   // import audit trail
  contextualData: {},   // supplemental voter-roll / census data from imports
  anomalies:      [],   // generated by AnomalyEngine from imported data only
  dims:           { years: [], counties: [], offices: [], types: [], methods: [], cycles: [] },
  hasData:        false,
  hydrated:           false,  // true once IndexedDB load attempt completes (even if empty)
  statewideTimeline:  [],     // precomputed; updated only when elections changes

  // ── UI State ──────────────────────────────────────────────────────────────
  activeTab:      'statewide',
  selectedYear:   null,
  selectedCounty: null,
  filters: {
    voteMethod:   'All',
    electionType: 'All',
    office:       'All',
    year:         null,
    county:       null,
    ballotType:   'All',
  },

  // ── Initialization ────────────────────────────────────────────────────────
  // Restores prior imports from IndexedDB. Never generates or estimates data.
  // async — called from useEffect in App.jsx, return value is not used.
  async initialize() {
    try {
      const t0 = performance.now()
      const [raw, snapshots, ctx] = await Promise.all([
        idbGet('elections',      []),
        idbGet('snapshots',      []),
        idbGet('contextualData', {}),
      ])
      console.debug(`[Perf] IndexedDB hydrate: ${(performance.now() - t0).toFixed(1)}ms, ${raw.length} records`)

      if (raw.length > 0) {
        const { records: cached, changed } = enrichMissingCounties(raw)
        if (changed) idbSet('elections', cached)
        const dims    = discoverDimensions(cached)
        const derived = recomputeDerived(cached)
        // Render the app immediately with data; anomaly computation is deferred
        set({ elections: cached, snapshots, contextualData: ctx, dims, hasData: true, hydrated: true, ...derived })
        // Anomaly engine is O(n×7) — defer off the render path so tabs paint first
        setTimeout(() => {
          const t1 = performance.now()
          const anomalies = runAnomalyAnalysis(get().elections, get().contextualData)
          console.debug(`[Perf] runAnomalyAnalysis: ${(performance.now() - t1).toFixed(1)}ms → ${anomalies.length} anomalies`)
          set({ anomalies })
        }, 0)
      } else {
        set({ hydrated: true })
      }
    } catch (e) {
      console.error('[Store] IndexedDB restore failed:', e)
      set({ hydrated: true })
    }
  },

  // ── Import ────────────────────────────────────────────────────────────────
  addRecords(newRecords, snapshotMeta) {
    const { elections, snapshots, contextualData } = get()

    const { records: enriched } = enrichMissingCounties(newRecords)

    const existingIds = new Set(elections.map(r => r.id))
    const fresh  = enriched.filter(r => !existingIds.has(r.id))
    const merged = [...elections, ...fresh]

    const snap     = createSnapshot({ records: enriched, ...snapshotMeta })
    const newSnaps = [...snapshots, snap]
    const dims     = discoverDimensions(merged)
    const derived  = recomputeDerived(merged)

    idbSet('elections', merged)
    idbSet('snapshots', newSnaps)

    set({ elections: merged, snapshots: newSnaps, dims, hasData: merged.length > 0, ...derived })

    setTimeout(() => {
      const t0 = performance.now()
      const anomalies = runAnomalyAnalysis(get().elections, get().contextualData)
      console.debug(`[Perf] runAnomalyAnalysis: ${(performance.now() - t0).toFixed(1)}ms → ${anomalies.length} anomalies`)
      set({ anomalies })
    }, 0)

    return snap
  },

  addContextualData(ctx) {
    const merged = { ...get().contextualData, ...ctx }
    idbSet('contextualData', merged)
    set({ contextualData: merged })
    setTimeout(() => {
      const anomalies = runAnomalyAnalysis(get().elections, merged)
      set({ anomalies })
    }, 0)
  },

  // Removes all imported data — leaves the app fully empty.
  // Does NOT load any sample or synthetic replacement.
  clearAllData() {
    _proxyByYear = null
    _csCache     = { electionsRef: null, byYear: {} }
    idbDelete('elections', 'snapshots', 'contextualData')
    set({
      elections: [], snapshots: [], contextualData: {},
      anomalies: [], dims: { years: [], counties: [], offices: [], types: [], methods: [], cycles: [] },
      hasData: false, selectedYear: null, selectedCounty: null,
      statewideTimeline: [],
    })
  },

  // ── Filters / UI ──────────────────────────────────────────────────────────
  setActiveTab:    (tab)        => set({ activeTab: tab }),
  setFilter:       (key, value) => set(s => ({ filters: { ...s.filters, [key]: value } })),
  setSelectedYear: (year)       => set({ selectedYear: year }),
  setSelectedCounty:(county)    => set({ selectedCounty: county }),
  clearFilters() {
    set({ filters: { voteMethod: 'All', electionType: 'All', office: 'All', year: null, county: null, ballotType: 'All' } })
  },

  // ── Derived Getters ───────────────────────────────────────────────────────
  getLatestYear() {
    const years = get().dims.years.filter(y => typeof y === 'number')
    return years.length ? Math.max(...years) : null
  },

  getStatewideTimeline() {
    return get().statewideTimeline
  },

  getCountySummary(year) {
    const { elections } = get()
    if (!elections.length) return []
    const targetYear = year || get().getLatestYear()
    // Invalidate cache if elections reference changed (new import or clear)
    if (_csCache.electionsRef !== elections) {
      _csCache = { electionsRef: elections, byYear: {} }
    }
    if (!_csCache.byYear[targetYear]) {
      const t0 = performance.now()
      _csCache.byYear[targetYear] = buildCountySummary(elections, targetYear, _proxyByYear)
      console.debug(`[Perf] buildCountySummary (${targetYear}): ${(performance.now() - t0).toFixed(1)}ms`)
    }
    return _csCache.byYear[targetYear]
  },

  getRolloffData(filters) {
    return buildRolloffData(get().elections, filters || {})
  },

  getFilteredElections() {
    const { elections, filters } = get()
    return elections.filter(r => {
      if (filters.year       && r.year !== filters.year)                               return false
      if (filters.county     && r.county !== filters.county)                           return false
      if (filters.office     && filters.office !== 'All'     && r.office !== filters.office)     return false
      if (filters.voteMethod && filters.voteMethod !== 'All' && r.voteMethod !== filters.voteMethod) return false
      if (filters.ballotType && filters.ballotType !== 'All' && r.ballotType !== filters.ballotType) return false
      return true
    })
  },
}))

export default useElectionStore
