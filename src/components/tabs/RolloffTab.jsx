import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, LineChart, Line, Legend, Cell,
} from 'recharts'
import useElectionStore from '../../store/electionStore.js'
import EmptyState from '../EmptyState.jsx'
import { fmt } from '../../utils/formatters.js'
import { isCandidateRecord } from '../../utils/candidateFilter.js'
import { GEORGIA_NONPARTISAN_NOTE } from '../../utils/partyClassifier.js'

const GRID = { stroke: '#1e2d4f', strokeDasharray: '3 3' }
const AXIS = { fill: '#64748b', fontSize: 11 }
const TT   = { contentStyle: { background: '#0c1428', border: '1px solid #273d65', borderRadius: 8, fontSize: 12 }, labelStyle: { color: '#94a3b8' } }

// ─── Office category classifier (presentation only, no data mutation) ─────────

const CATEGORY_ORDER = ['Governor', 'Senate', 'Judicial', 'PSC', 'Constitutional', 'Referenda/Questions', 'Other']

function classifyOffice(office) {
  if (!office) return 'Other'
  const lc = office.toLowerCase()
  if (lc.includes('governor'))                                                              return 'Governor'
  if (lc.includes('senate') || lc.includes('senator'))                                    return 'Senate'
  if (lc.includes('justice') || lc.includes('judge') || lc.includes('court'))             return 'Judicial'
  if (lc.includes('public service') || lc.includes(' psc'))                               return 'PSC'
  if (lc.includes('lieutenant') || lc.includes('secretary') || lc.includes('attorney general') ||
      lc.includes('commissioner') || lc.includes('superintendent') ||
      lc.includes('treasurer') || lc.includes('comptroller') || lc.includes('insurance'))  return 'Constitutional'
  if (lc.includes('party question') || lc.includes('referendum') ||
      lc.includes('constitutional amendment') || lc.includes('ballot question'))           return 'Referenda/Questions'
  return 'Other'
}

function rolloffColor(pct) {
  if (pct >= 30) return '#ef4444'
  if (pct >= 20) return '#f97316'
  if (pct >= 10) return '#f59e0b'
  if (pct >= 3)  return '#6366f1'
  return '#10b981'
}

function shortLabel(office) {
  return office
    .replace(/^U\.?S\.?\s+/i, '')
    .replace(/^Georgia\s+/i, 'GA ')
    .replace('Secretary of State', 'SoS')
    .replace('Attorney General', 'AG')
    .replace('Lieutenant Governor', 'Lt. Gov')
    .replace('Commissioner of', 'Comm.')
    .replace('Superintendent of', 'Supt.')
    .slice(0, 30)
}

// ─── Normalize office names ───────────────────────────────────────────────────
// Some Georgia SOS exports encode party into the office name:
//   "Commissioner of Labor - Democratic Primary"
//   "Lt. Governor - Republican"
// Stripping the trailing party suffix collapses these into a single map key so
// R and D votes accumulate correctly under the same office.

function normalizeOfficeName(office) {
  if (!office) return office
  return office
    .replace(/\s*[-–—]\s*(republican|democratic|democrat|nonpartisan|libertarian|gop|rep|dem)\s*(primary|ballot|party|ticket)?\s*$/i, '')
    .replace(/\s*\((r|d|rep|dem|republican|democratic)\)\s*$/i, '')
    .trim()
}

// ─── Office scope classifier — determines voter eligibility pool ──────────────
// Returns { scope, scopeKey } where scopeKey is the comparison-group key.
// Rolloff is only meaningful between races sharing the same scopeKey.
// Call on NORMALIZED office names.

function classifyScope(office) {
  if (!office) return { scope: 'other', scopeKey: 'other' }
  const lc = office.toLowerCase()
  const m  = office.match(/(?:district|circuit|seat)\s+(\d+)/i)
  const dn = m ? m[1] : null

  // ── Congressional (U.S. House) — must check before state house ───────────
  // Georgia SOS uses several formats: "Representative in Congress, District N",
  // "U.S. Representative, District N", "U.S. House of Representatives"
  if (lc.includes('representative in congress') ||
      lc.includes('u.s. representative') ||
      lc.includes('us representative')   ||
      lc.includes('u.s. house')          ||
      lc.includes('us house')            ||
      lc.includes('united states house') ||
      lc.includes('united states representative') ||
      lc.includes('congressional district') ||
      lc.includes('congress district')   ||
      (lc.includes('congress') && lc.includes('district')))
    return { scope: 'congressional', scopeKey: dn ? `congressional:${dn}` : 'congressional' }

  // ── State House — must check before bare "house of representatives" ───────
  if (lc.includes('state house')        ||
      lc.includes('state representative')||
      lc.includes('house of representative'))
    return { scope: 'state_house', scopeKey: dn ? `state_house:${dn}` : 'state_house' }

  // ── State Senate (not U.S. Senate) ───────────────────────────────────────
  if ((lc.includes('state senate')  ||
       lc.includes('state senator') ||
       (lc.includes('senate') && lc.includes('district'))) &&
      !lc.includes('u.s') && !lc.includes('united states'))
    return { scope: 'state_senate', scopeKey: dn ? `state_senate:${dn}` : 'state_senate' }

  // ── Judicial — broad pattern before statewide/other matching ────────────────
  // "Clerk of Superior Court" is a partisan administrative officer, not a judge.
  // Guard it before the pattern so "superior"/"court" don't misfire.
  if (/\bclerk\s+of\b/i.test(office))
    return { scope: 'other', scopeKey: 'other' }
  const judicialPattern =
    /(judge|justice|court|appeal|magistrate|probate|superior|juvenile|state court|supreme)/i
  if (judicialPattern.test(office))
    return { scope: 'judicial', scopeKey: 'judicial' }

  // ── Statewide executive + U.S. Senate + PSC ───────────────────────────────
  // PSC commissioners are elected by all GA voters even though they hold district seats.
  if (lc.includes('governor')               ||
      lc.includes('lieutenant governor')    ||
      lc.includes('attorney general')       ||
      lc.includes('secretary of state')     ||
      lc.includes('treasurer')              ||
      lc.includes('superintendent')         ||
      lc.includes('commissioner of agriculture') ||
      lc.includes('agriculture commissioner')    ||
      lc.includes('insurance commissioner') ||
      lc.includes('commissioner of insurance')   ||
      lc.includes('labor commissioner')     ||
      lc.includes('commissioner of labor')  ||
      lc.includes('u.s. senate')            ||
      lc.includes('us senate')              ||
      lc.includes('united states senate')   ||
      lc.includes('public service commission') ||
      lc.includes('public service commissioner'))
    return { scope: 'statewide', scopeKey: 'statewide' }

  // ── Circuit/district judicial — Superior, State, Probate, Magistrate ──────
  if (lc.includes('superior court') || lc.includes('state court') ||
      lc.includes('probate')         || lc.includes('magistrate')  ||
      lc.includes('judge')           || lc.includes('justice')     ||
      lc.includes('court')) {
    let courtType = 'court'
    if      (lc.includes('superior'))   courtType = 'superior'
    else if (lc.includes('state court'))courtType = 'state_court'
    else if (lc.includes('probate'))    courtType = 'probate'
    else if (lc.includes('magistrate')) courtType = 'magistrate'
    return { scope: 'judicial', scopeKey: dn ? `judicial:${courtType}:${dn}` : `judicial:${courtType}` }
  }

  return { scope: 'other', scopeKey: 'other' }
}

const SCOPE_LABELS = {
  statewide:    'Statewide Races',
  congressional:'Congressional Districts',
  state_senate: 'State Senate Districts',
  state_house:  'State House Districts',
  judicial:     'Judicial',
  other:        'Other',
}

// ─── Custom tooltip with formula explanation ───────────────────────────────────

function RolloffTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#0c1428', border: '1px solid #273d65', borderRadius: 8, padding: '10px 14px', fontSize: 12, maxWidth: 260 }}>
      <p className="text-slate-200 font-semibold mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.fill || p.color }} className="mb-0.5">
          {p.name}: <span className="font-semibold">{Number(p.value).toFixed(1)}%</span>
        </p>
      ))}
      <div className="mt-2 pt-2 border-t border-navy-600">
        <p className="text-slate-500 text-xs font-mono">Roll-Off % = (top votes − race votes) / top votes</p>
        <p className="text-slate-600 text-xs mt-0.5">Roll-off compares contests with similar voter eligibility.</p>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RolloffTab() {
  const hasData   = useElectionStore(s => s.hasData)
  const elections = useElectionStore(s => s.elections)
  const dims      = useElectionStore(s => s.dims)

  const latestYear = dims.years.filter(y => typeof y === 'number').at(-1) ?? null

  const [selectedYear,      setYear]             = useState(null)
  const [party,             setParty]            = useState('Both')
  const [selectedScope,     setScope]            = useState('statewide')
  const [selectedCategory,  setCategory]         = useState('All')
  const [displayLimit,      setDisplayLimit]     = useState(10)
  const [includeQuestions,  setIncludeQuestions] = useState(false)

  const targetYear = selectedYear || latestYear

  // ── Calculations ───────────────────────────────────────────────────────────

  const rolloffData = useMemo(() => {
    if (!targetYear) return []

    // Two-stage filter — open to all valid party values including nonpartisan:
    //   1. isCandidateRecord — blocks BALLOT_TOTALS, referendum offices, and rows
    //      where candidate is MISSING_DATA / Yes / No / Undervotes / etc.
    //   2. candidateParty === 'MISSING_DATA' rows are allowed through only when
    //      the row carries real votes (> 0). isCandidateRecord already blocks rows
    //      where candidate itself is 'MISSING_DATA'; the votes guard catches any
    //      remaining zero-vote aggregate office-total rows.
    //      Nonpartisan/Judicial/Independent/blank party values are all allowed.
    const rawForYear = elections.filter(r => r.year === targetYear)
    const recs = rawForYear.filter(r => {
      if (!isCandidateRecord(r)) return false
      if (r.candidateParty === 'MISSING_DATA') return (r.votes || 0) > 0
      return true
    })

    // Normalize office names — collapses "Governor - Democratic Primary" and
    // "Governor - Republican Primary" into a single map key.
    // N captures Nonpartisan, Independent, Judicial, and any other valid party.
    const officeVotes = new Map()
    for (const r of recs) {
      const key = normalizeOfficeName(r.office)
      if (!officeVotes.has(key)) officeVotes.set(key, { R: 0, D: 0, N: 0 })
      const row = officeVotes.get(key)
      if      (r.candidateParty === 'Republican') row.R += (r.votes || 0)
      else if (r.candidateParty === 'Democratic') row.D += (r.votes || 0)
      else                                        row.N += (r.votes || 0)
    }

    // Tag each valid office with its eligibility scope; discard zero-vote offices.
    const validOffices = [...officeVotes.entries()]
      .map(([office, v]) => ({
        office, R: v.R, D: v.D, N: v.N, total: v.R + v.D + v.N,
        ...classifyScope(office),
      }))
      .filter(r => r.total > 0)

    // Per-scopeKey baselines — rolloff is computed only within the same electorate group.
    const scopeBaselines = new Map()
    for (const r of validOffices) {
      if (!scopeBaselines.has(r.scopeKey))
        scopeBaselines.set(r.scopeKey, { topR: 0, topD: 0, topN: 0, topT: 0, topRaceR: '', topRaceD: '', topRaceN: '', topRaceT: '' })
      const b = scopeBaselines.get(r.scopeKey)
      if (r.R     > b.topR) { b.topR = r.R;     b.topRaceR = r.office }
      if (r.D     > b.topD) { b.topD = r.D;     b.topRaceD = r.office }
      if (r.N     > b.topN) { b.topN = r.N;     b.topRaceN = r.office }
      if (r.total > b.topT) { b.topT = r.total; b.topRaceT = r.office }
    }

    // Ballot-sequence baselines: the top statewide R/D race anchors the full ballot.
    // Nonpartisan/judicial races appear after party questions on the actual ballot and
    // are traversed by every partisan voter — they must be measured against the same
    // top anchor, not against a separate nonpartisan pool top.
    const seqBaseR = validOffices.filter(r => r.scope === 'statewide').reduce((m, r) => Math.max(m, r.R), 0)
    const seqBaseD = validOffices.filter(r => r.scope === 'statewide').reduce((m, r) => Math.max(m, r.D), 0)

    const result = [...validOffices]
      .sort((a, b) => b.total - a.total)
      .map(row => {
        const b = scopeBaselines.get(row.scopeKey)
        const isNonpartisan = row.R === 0 && row.D === 0 && row.N > 0
        // For partisan offices use their party votes; for nonpartisan use N votes as proxy
        // for the votes a partisan voter would have cast continuing down the ballot.
        const rSeqVotes = row.R > 0 ? row.R : isNonpartisan ? row.N : 0
        const dSeqVotes = row.D > 0 ? row.D : isNonpartisan ? row.N : 0
        return {
          ...row,
          shortOffice:  row.office.replace('U.S. ', '').replace('Secretary of ', 'SoS ').slice(0, 18),
          rRolloff:     row.R > 0 && b.topR > 0 ? (1 - row.R / b.topR) * 100 : null,
          dRolloff:     row.D > 0 && b.topD > 0 ? (1 - row.D / b.topD) * 100 : null,
          nRolloff:     row.N > 0 && b.topN > 0 ? (1 - row.N / b.topN) * 100 : null,
          totalRolloff: b.topT > 0 ? (1 - row.total / b.topT) * 100 : 0,
          // Ballot-sequence roll-off: continuous from top partisan race through full ballot
          rSeqRolloff:  seqBaseR > 0 && rSeqVotes > 0 ? (1 - rSeqVotes / seqBaseR) * 100 : null,
          dSeqRolloff:  seqBaseD > 0 && dSeqVotes > 0 ? (1 - dSeqVotes / seqBaseD) * 100 : null,
        }
      })

    return result
  }, [elections, targetYear, hasData])

  const rolloffTrend = useMemo(() => {
    return dims.years.map(year => {
      const recs = elections.filter(r => {
        if (r.year !== year) return false
        if (!isCandidateRecord(r)) return false
        if (r.candidateParty === 'MISSING_DATA') return (r.votes || 0) > 0
        return true
      })
      const officeVotes = new Map()
      for (const r of recs) {
        const key = normalizeOfficeName(r.office)
        if (!officeVotes.has(key)) officeVotes.set(key, { R: 0, D: 0, N: 0 })
        const row = officeVotes.get(key)
        if      (r.candidateParty === 'Republican') row.R += (r.votes || 0)
        else if (r.candidateParty === 'Democratic') row.D += (r.votes || 0)
        else                                        row.N += (r.votes || 0)
      }
      // Trend uses statewide-only baseline so district offices don't distort the top anchor
      const statewide = [...officeVotes.entries()]
        .map(([o, v]) => ({ office: o, total: v.R + v.D + v.N, ...classifyScope(o) }))
        .filter(r => r.total > 0 && r.scope === 'statewide')
        .sort((a, b) => b.total - a.total)
      const row = { year }
      if (statewide.length) {
        const topTotal = statewide[0].total
        for (const { office, total } of statewide.slice(1)) {
          row[office] = (1 - total / topTotal) * 100
        }
      }
      return row
    })
  }, [elections, dims.years, hasData])

  const countyRolloff = useMemo(() => {
    if (!targetYear) return []
    const counties = [...new Set(elections.map(r => r.county))].sort()
    const rows = counties.map(county => {
      const recs = elections.filter(r => {
        if (r.year !== targetYear || r.county !== county) return false
        if (!isCandidateRecord(r)) return false
        if (r.candidateParty === 'MISSING_DATA') return (r.votes || 0) > 0
        return true
      })
      const officeVotes = new Map()
      for (const r of recs) {
        const key = normalizeOfficeName(r.office)
        if (!officeVotes.has(key)) officeVotes.set(key, { R: 0, D: 0, N: 0 })
        const row = officeVotes.get(key)
        if      (r.candidateParty === 'Republican') row.R += (r.votes || 0)
        else if (r.candidateParty === 'Democratic') row.D += (r.votes || 0)
        else                                        row.N += (r.votes || 0)
      }
      // Statewide scope only — every county voter was eligible for these.
      // District races (State House, Congressional, etc.) have sub-county electorates
      // and must never anchor the top or bottom position in county rolloff.
      const vTotal = v => v.R + v.D + v.N
      const validOffices = [...officeVotes.entries()]
        .filter(([office, v]) => vTotal(v) > 0 && classifyScope(office).scope === 'statewide')
        .sort((a, b) => vTotal(b[1]) - vTotal(a[1]))
      if (validOffices.length < 2) return { county, insufficient: true }
      const [topOffice, topV] = validOffices[0]
      const [botOffice, botV] = validOffices[validOffices.length - 1]
      const topTotal  = vTotal(topV)
      const lastTotal = vTotal(botV)
      return {
        county,
        topRace:    topOffice,
        bottomRace: botOffice,
        topTotal,
        lastTotal,
        rolloffPct: (1 - lastTotal / topTotal) * 100,
        statewideOfficeCount: validOffices.length,
      }
    })

    return rows.filter(c => !c.insufficient).sort((a, b) => b.rolloffPct - a.rolloffPct)
  }, [elections, targetYear, hasData])

  // ── Presentation-layer derivations (no new data calculations) ───────────────

  const rolloffKey   = party === 'R' ? 'rSeqRolloff' : party === 'D' ? 'dSeqRolloff' : 'totalRolloff'
  const rolloffLabel = party === 'R' ? 'R Ballot Roll-Off' : party === 'D' ? 'D Ballot Roll-Off' : 'Total Roll-Off'

  // Category options with race counts — scoped to the selected party + scope
  const availableCategories = useMemo(() => {
    const counts = {}
    for (const r of rolloffData) {
      // Nonpartisan races (N>0, R=0, D=0) appear on all ballots — never exclude them by party.
      const isNonpartisan = r.R === 0 && r.D === 0 && r.N > 0
      if (party === 'R' && r.R === 0 && !isNonpartisan) continue
      if (party === 'D' && r.D === 0 && !isNonpartisan) continue
      if (selectedScope !== 'All' && r.scope !== selectedScope) continue
      const cat = classifyOffice(r.office)
      if (!includeQuestions && cat === 'Referenda/Questions') continue
      counts[cat] = (counts[cat] || 0) + 1
    }
    const totalVisible = Object.values(counts).reduce((s, n) => s + n, 0)
    const present      = new Set(Object.keys(counts))
    return [
      { value: 'All', label: `All (${totalVisible})` },
      ...CATEGORY_ORDER.filter(c => present.has(c)).map(c => ({ value: c, label: `${c} (${counts[c]})` })),
    ]
  }, [rolloffData, includeQuestions, party, selectedScope])

  // filteredPool: full sorted pool after scope/party/category/questions filters, before display limit.
  const filteredPool = useMemo(() => {
    let data = rolloffData
      .filter(r => {
        if (selectedScope !== 'All' && r.scope !== selectedScope) return false
        // Nonpartisan races (N>0, R=0, D=0) appear on all ballots — pass them through any ballot filter.
        const isNonpartisan = r.R === 0 && r.D === 0 && r.N > 0
        if (party === 'R') return r.R > 0 || isNonpartisan
        if (party === 'D') return r.D > 0 || isNonpartisan
        return true
      })
      .map(r => ({ ...r, category: classifyOffice(r.office), displayOffice: shortLabel(r.office) }))
    if (!includeQuestions) data = data.filter(r => r.category !== 'Referenda/Questions')
    if (selectedCategory !== 'All') data = data.filter(r => r.category === selectedCategory)

    return [...data].sort((a, b) => (b[rolloffKey] ?? -1) - (a[rolloffKey] ?? -1))
  }, [rolloffData, includeQuestions, selectedCategory, rolloffKey, party, selectedScope])

  // displayData: presentation slice only — underlying analysis always uses full rolloffData
  const displayData = useMemo(() => {
    return displayLimit === 'all' ? filteredPool : filteredPool.slice(0, Number(displayLimit))
  }, [filteredPool, displayLimit])

  // When party === 'Both', render two complete ballot sequences.
  // Nonpartisan/judicial races (N>0, R=0, D=0) are appended to both sequences because
  // every partisan voter continues into the nonpartisan section after party questions.
  const limit = displayLimit === 'all' ? Infinity : Number(displayLimit)
  const rPool = party === 'Both'
    ? filteredPool
        .filter(r => r.R > 0 || (r.R === 0 && r.D === 0 && r.N > 0))
        .sort((a, b) => (b.rSeqRolloff ?? -1) - (a.rSeqRolloff ?? -1))
        .slice(0, limit)
    : []
  const dPool = party === 'Both'
    ? filteredPool
        .filter(r => r.D > 0 || (r.R === 0 && r.D === 0 && r.N > 0))
        .sort((a, b) => (b.dSeqRolloff ?? -1) - (a.dSeqRolloff ?? -1))
        .slice(0, limit)
    : []

  const insights = useMemo(() => {
    const base = rolloffData
      .filter(r => selectedScope === 'All' || r.scope === selectedScope)
      .map(r => ({ ...r, category: classifyOffice(r.office), val: r[rolloffKey] }))
      .filter(r => !includeQuestions ? r.category !== 'Referenda/Questions' : true)
    if (!base.length) return null

    const nonZero = base.filter(r => r.val != null && r.val > 0)
    const highest = nonZero.reduce((m, r) => r.val > m.val ? r : m, nonZero[0] ?? base[0])

    const byCat = {}
    for (const r of nonZero) {
      if (!byCat[r.category]) byCat[r.category] = []
      byCat[r.category].push(r.val)
    }
    const highestCat = Object.entries(byCat)
      .map(([cat, vals]) => ({ cat, avg: vals.reduce((s, v) => s + v, 0) / vals.length }))
      .sort((a, b) => b.avg - a.avg)[0]

    const overallAvg = nonZero.length
      ? nonZero.reduce((s, r) => s + r.val, 0) / nonZero.length
      : 0

    return { highest, highestCat, overallAvg, raceCount: base.length }
  }, [rolloffData, rolloffKey, includeQuestions, selectedScope])

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!hasData) return <EmptyState />

  const trendOffices = rolloffTrend.length
    ? Object.keys(rolloffTrend[0]).filter(k => k !== 'year').slice(0, 5)
    : []
  const trendColors = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#3b82f6']
  const noRaceData  = rolloffData.length === 0

  const chartHeight = Math.max(200, displayData.length * 32 + 20)

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">

      {/* Header */}
      <div className="mb-4">
        <h2 className="text-xl font-bold text-slate-100">Ballot Roll-Off Analysis</h2>
        <p className="text-sm text-slate-400 mt-1">
          Measures how many voters stopped voting lower on the ballot.
          Requires candidate-level records in your import.
        </p>
        <p className="text-xs text-slate-600 mt-1 font-mono">
          Roll-Off % = (top race votes − race votes) / top race votes × 100
        </p>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="stat-label block mb-1">Election Year</label>
            <select value={targetYear || ''} onChange={e => setYear(Number(e.target.value))} className="filter-select">
              {dims.years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="stat-label block mb-1">Ballot Type</label>
            <select value={party} onChange={e => setParty(e.target.value)} className="filter-select">
              <option value="Both">Both Ballots</option>
              <option value="R">Republican Ballot</option>
              <option value="D">Democratic Ballot</option>
            </select>
          </div>
          <div>
            <label className="stat-label block mb-1">Comparison Scope</label>
            <select value={selectedScope} onChange={e => { setScope(e.target.value); setCategory('All'); setDisplayLimit(10) }} className="filter-select">
              <option value="statewide">Statewide Races</option>
              <option value="All">All Scopes</option>
              <option value="congressional">Congressional Districts</option>
              <option value="state_senate">State Senate Districts</option>
              <option value="state_house">State House Districts</option>
              <option value="judicial">Judicial</option>
            </select>
          </div>
          <div>
            <label className="stat-label block mb-1">Office Category</label>
            <select value={selectedCategory} onChange={e => { setCategory(e.target.value); setDisplayLimit(10) }} className="filter-select">
              {availableCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="stat-label block mb-1">Show</label>
            <select
              value={String(displayLimit)}
              onChange={e => setDisplayLimit(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="filter-select"
            >
              <option value="10">Top 10</option>
              <option value="25">Top 25</option>
              <option value="50">Top 50</option>
              <option value="all">All contests</option>
            </select>
          </div>
          <div className="ml-auto">
            <label className="flex items-center gap-2 cursor-pointer select-none mt-5">
              <input type="checkbox" checked={includeQuestions} onChange={e => setIncludeQuestions(e.target.checked)}
                className="accent-indigo-500 w-3.5 h-3.5" />
              <span className="text-xs text-slate-400">Include referenda / party questions</span>
            </label>
          </div>
        </div>
      </div>

      {noRaceData && (
        <div className="card text-center py-12">
          <p className="text-slate-500 text-sm">No race-level candidate data for {targetYear}.</p>
          <p className="text-slate-600 text-xs mt-2">
            Roll-off analysis requires candidate-level records (with office and candidate columns).
            Ballot-total-only records are insufficient for this view.
          </p>
        </div>
      )}

      {!noRaceData && (
        <>
          {/* Insight cards */}
          {insights && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="card">
                <div className="stat-label mb-1">Highest Voter Drop-Off</div>
                <div className="text-lg font-bold text-red-400">
                  {insights.highest ? `${insights.highest.val.toFixed(1)}%` : '—'}
                </div>
                <div className="text-xs text-slate-400 mt-0.5 truncate" title={insights.highest?.office}>
                  {insights.highest ? shortLabel(insights.highest.office) : '—'}
                </div>
              </div>
              <div className="card">
                <div className="stat-label mb-1">Highest-Dropout Category</div>
                <div className="text-lg font-bold text-amber-400">
                  {insights.highestCat?.cat ?? '—'}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {insights.highestCat ? `avg ${insights.highestCat.avg.toFixed(1)}% drop-off` : '—'}
                </div>
              </div>
              <div className="card">
                <div className="stat-label mb-1">Average Roll-Off</div>
                <div className="text-lg font-bold text-indigo-400">
                  {insights.overallAvg > 0 ? `${insights.overallAvg.toFixed(1)}%` : '—'}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  across {insights.raceCount} {insights.raceCount === 1 ? 'race' : 'races'} · {targetYear}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

            {/* Main roll-off chart — split by ballot universe when Both is selected */}
            {party === 'Both' ? (
              <>
                {[
                  { label: 'Republican Ballot Roll-Off', pool: rPool, key: 'rSeqRolloff', accent: '#ef4444' },
                  { label: 'Democratic Ballot Roll-Off', pool: dPool, key: 'dSeqRolloff', accent: '#3b82f6' },
                ].map(({ label, pool, key, accent }) => (
                  <div key={key} className="card xl:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="section-title">
                        {label} — {targetYear}
                        <span className="ml-2 text-slate-500 font-normal text-xs">· {SCOPE_LABELS[selectedScope] ?? 'All Scopes'}</span>
                      </div>
                      <div className="flex gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-red-500"/>≥ 30%</span>
                        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-orange-500"/>≥ 20%</span>
                        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-amber-500"/>≥ 10%</span>
                        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-indigo-500"/>≥ 3%</span>
                        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500"/>&lt; 3%</span>
                      </div>
                    </div>
                    {pool.length === 0 ? (
                      <p className="text-slate-500 text-sm py-8 text-center">No races in this ballot universe match current filters.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={Math.max(200, pool.length * 32 + 20)}>
                        <BarChart data={pool} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 180 }}>
                          <CartesianGrid {...GRID} horizontal={false} />
                          <XAxis type="number" tickFormatter={v => `${v.toFixed(0)}%`} tick={AXIS} domain={[0, 'dataMax + 2']} />
                          <YAxis type="category" dataKey="displayOffice" tick={{ ...AXIS, fontSize: 10 }} width={175} />
                          <Tooltip content={<RolloffTooltip />} />
                          <Bar dataKey={key} name={label} radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 10, fill: '#94a3b8', formatter: v => v != null && v > 0 ? `${Number(v).toFixed(1)}%` : '' }}>
                            {pool.map((r, i) => (
                              <Cell key={i} fill={rolloffColor(r[key])} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                    <p className="text-xs text-slate-500 mt-2">
                      Roll-off % = (top race votes − race votes) / top race votes × 100. Nonpartisan/judicial races are scored against the same top partisan anchor — reflecting continuous traversal of the full ballot.
                    </p>
                    <p className="text-xs text-amber-600/70 mt-1">
                      ⚠ {GEORGIA_NONPARTISAN_NOTE}
                    </p>
                  </div>
                ))}
              </>
            ) : (
              <div className="card xl:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="section-title">
                    {displayLimit === 'all'
                      ? `All ${filteredPool.length} Contests`
                      : `Top ${displayData.length} of ${filteredPool.length} Contests`} — {targetYear}
                    <span className="ml-2 text-slate-500 font-normal text-xs">· {SCOPE_LABELS[selectedScope] ?? 'All Scopes'}{selectedCategory !== 'All' ? ` · ${selectedCategory}` : ''}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-red-500"/>≥ 30%</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-orange-500"/>≥ 20%</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-amber-500"/>≥ 10%</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-indigo-500"/>≥ 3%</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500"/>&lt; 3%</span>
                  </div>
                </div>
                {displayData.length === 0 ? (
                  <p className="text-slate-500 text-sm py-8 text-center">No races match the current filters.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <BarChart data={displayData} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 180 }}>
                      <CartesianGrid {...GRID} horizontal={false} />
                      <XAxis type="number" tickFormatter={v => `${v.toFixed(0)}%`} tick={AXIS} domain={[0, 'dataMax + 2']} />
                      <YAxis type="category" dataKey="displayOffice" tick={{ ...AXIS, fontSize: 10 }} width={175} />
                      <Tooltip content={<RolloffTooltip />} />
                      <Bar dataKey={rolloffKey} name={rolloffLabel} radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 10, fill: '#94a3b8', formatter: v => v > 0 ? `${Number(v).toFixed(1)}%` : '' }}>
                        {displayData.map((r, i) => (
                          <Cell key={i} fill={rolloffColor(r[rolloffKey])} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <p className="text-xs text-slate-500 mt-2">
                  Roll-off % = (top race votes − race votes) / top race votes × 100. Nonpartisan/judicial races are scored against the top partisan race — reflecting continuous traversal of the full ballot.
                  {displayData.length < filteredPool.length && (
                    <span className="text-slate-600 ml-1">
                      Showing {displayData.length} of {filteredPool.length} contests — increase the limit to see more.
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Total votes by race — existing chart, filtered to display set */}
            <div className="card xl:col-span-2">
              <div className="section-title">Total Votes by Race — {targetYear}</div>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={displayData} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 180 }}>
                  <CartesianGrid {...GRID} horizontal={false} />
                  <XAxis type="number" tickFormatter={v => fmt.votes(v)} tick={AXIS} />
                  <YAxis type="category" dataKey="displayOffice" tick={{ ...AXIS, fontSize: 10 }} width={175} />
                  <Tooltip {...TT} formatter={(v, name) => [fmt.number(v), name === 'R' ? 'Republican Ballot' : 'Democratic Ballot']} />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={v => v === 'R' ? 'Republican Ballot' : 'Democratic Ballot'} />
                  <Bar dataKey="R" fill="#ef444466" stroke="#ef4444" radius={[0, 3, 3, 0]} name="R" />
                  <Bar dataKey="D" fill="#3b82f666" stroke="#3b82f6" radius={[0, 3, 3, 0]} name="D" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Trend chart — unchanged */}
            {trendOffices.length > 0 && (
              <div className="card xl:col-span-2">
                <div className="section-title">Roll-Off Trend by Office — All Imported Cycles</div>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={rolloffTrend} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="year" tick={AXIS} />
                    <YAxis tickFormatter={v => `${v.toFixed(0)}%`} tick={AXIS} />
                    <Tooltip {...TT} formatter={(v, name) => [v != null ? `${Number(v).toFixed(1)}%` : '—', name]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {trendOffices.map((office, i) => (
                      <Line key={office} type="monotone" dataKey={office}
                        stroke={trendColors[i % trendColors.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {countyRolloff.length > 0 && (
              <div className="card xl:col-span-2">
                <div className="section-title">County Roll-Off — {targetYear} <span className="text-slate-500 font-normal text-xs ml-1">(statewide races only)</span></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500 border-b border-navy-500">
                        <th className="text-left py-2 pr-4">County</th>
                        <th className="text-left py-2 pr-4">Top Race</th>
                        <th className="text-right py-2 pr-4">Top Votes</th>
                        <th className="text-left py-2 pr-4">Bottom Race</th>
                        <th className="text-right py-2 pr-4">Bottom Votes</th>
                        <th className="text-right py-2">Roll-Off</th>
                      </tr>
                    </thead>
                    <tbody>
                      {countyRolloff.slice(0, 30).map(c => (
                        <tr key={c.county} className="border-b border-navy-700 hover:bg-navy-700/30">
                          <td className="py-2 pr-4 text-slate-200 font-medium">{c.county}</td>
                          <td className="py-2 pr-4 text-slate-400 max-w-[140px] truncate" title={c.topRace}>{shortLabel(c.topRace)}</td>
                          <td className="py-2 pr-4 text-right text-slate-300">{fmt.number(c.topTotal)}</td>
                          <td className="py-2 pr-4 text-slate-400 max-w-[140px] truncate" title={c.bottomRace}>{shortLabel(c.bottomRace)}</td>
                          <td className="py-2 pr-4 text-right text-slate-300">{fmt.number(c.lastTotal)}</td>
                          <td className={`py-2 text-right font-medium ${c.rolloffPct > 25 ? 'text-red-400' : c.rolloffPct > 15 ? 'text-amber-400' : 'text-slate-300'}`}>
                            {c.rolloffPct.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
