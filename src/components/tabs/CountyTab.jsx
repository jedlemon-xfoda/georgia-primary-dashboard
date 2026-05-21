import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import CountyMap from '../map/CountyMap.jsx'
import EmptyState from '../EmptyState.jsx'
import useElectionStore from '../../store/electionStore.js'
import { fmt, stoplightColor } from '../../utils/formatters.js'

const GRID = { stroke: '#1e2d4f', strokeDasharray: '3 3' }
const AXIS = { fill: '#64748b', fontSize: 11 }
const TT   = { contentStyle: { background: '#0c1428', border: '1px solid #273d65', borderRadius: 8, fontSize: 12 }, labelStyle: { color: '#94a3b8' } }

function MissingField({ label }) {
  return (
    <div className="card-sm">
      <div className="stat-label mb-1">{label}</div>
      <div className="text-lg font-bold text-slate-600">—</div>
      <div className="text-xs text-slate-700 mt-0.5 italic">Not in imported data</div>
    </div>
  )
}

export default function CountyTab() {
  // ── Store subscriptions — all hooks must be unconditional and first ──────────
  const hasData          = useElectionStore(s => s.hasData)
  const elections        = useElectionStore(s => s.elections)
  const dims             = useElectionStore(s => s.dims)
  // Select the function reference — do NOT call inside the selector (causes infinite
  // re-render because every call returns a new array, which Zustand sees as a change)
  const getCountySummary = useElectionStore(s => s.getCountySummary)

  // ── Local state ──────────────────────────────────────────────────────────────
  const [selectedYear,   setYear]   = useState(null)
  const [selectedCounty, setCounty] = useState(null)
  const [search,         setSearch] = useState('')

  // ── Derived values (non-hooks) ───────────────────────────────────────────────
  // Guard against MISSING_DATA sentinel leaking into dims.years
  const numericYears  = dims.years.filter(y => typeof y === 'number')
  const latestYear    = numericYears[numericYears.length - 1]
  const targetYear    = selectedYear || latestYear
  // Call the getter outside the selector — no infinite loop
  const countySummary = getCountySummary(targetYear)

  // ── Memoized transforms — hooks, so must appear before any conditional return ─
  const filtered = useMemo(() => {
    if (!search) return countySummary
    return countySummary.filter(c => c.county.toLowerCase().includes(search.toLowerCase()))
  }, [countySummary, search])

  const countyTimeline = useMemo(() => {
    if (!selectedCounty) return []
    return numericYears
      .map(year => {
        // Do NOT filter on office === 'BALLOT_TOTALS' — SOS exports use real office names.
        // Aggregate all records for this county/year, grouped by party.
        const recs = elections.filter(r => r.county === selectedCounty && r.year === year)
        const R = recs
          .filter(r => (r.ballotType || r.candidateParty) === 'Republican')
          .reduce((s, r) => s + Number(r.votes || 0), 0)
        const D = recs
          .filter(r => (r.ballotType || r.candidateParty) === 'Democratic')
          .reduce((s, r) => s + Number(r.votes || 0), 0)
        const total = R + D
        return {
          year,
          R, D, total,
          rSharePct:    total > 0 ? (R / total) * 100 : null,
          electionType: recs[0]?.electionType,
        }
      })
      .filter(r => r.total > 0)
  }, [elections, selectedCounty, numericYears])

  // ── Early return — after all hooks ──────────────────────────────────────────
  if (!hasData) return <EmptyState />

  const detail = selectedCounty ? countySummary.find(c => c.county === selectedCounty) : null

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div>
          <label className="stat-label block mb-1">Display Cycle</label>
          <select value={targetYear || ''} onChange={e => setYear(Number(e.target.value))} className="filter-select">
            {numericYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="stat-label block mb-1">Search County</label>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Type county name…" className="filter-select" />
        </div>
        {selectedCounty && (
          <div className="self-end">
            <button onClick={() => setCounty(null)}
              className="text-sm text-slate-400 hover:text-slate-200 px-3 py-1.5 border border-navy-400 rounded-lg">
              Clear Selection
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Map */}
        <div className="xl:col-span-2 card p-3">
          <div className="section-title px-2">Georgia County Map — {targetYear || '—'} Primary</div>
          {!targetYear ? (
            <div className="py-16 text-center text-slate-600 text-sm">No election year available in imported data.</div>
          ) : (
            <CountyMap
              countyData={countySummary}
              selectedCounty={selectedCounty}
              onCountyClick={setCounty}
            />
          )}
        </div>

        {/* Detail + list */}
        <div className="space-y-4">
          {detail ? (
            <motion.div key={selectedCounty} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="card">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-base font-bold text-slate-100">{selectedCounty} County</div>
                  {detail.zScore != null ? (
                    <div className={`text-xs mt-0.5 ${stoplightColor(detail.severity).text}`}>
                      {detail.severity} — {Math.abs(detail.zScore).toFixed(2)}σ deviation
                    </div>
                  ) : (
                    <div className="text-xs mt-0.5 text-slate-600 italic">
                      Deviation unavailable — need ≥2 prior comparable cycles
                    </div>
                  )}
                </div>
                <button onClick={() => setCounty(null)} className="text-slate-500 hover:text-slate-300 text-lg">&times;</button>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                {detail.rShare != null
                  ? <div className="card-sm"><div className="stat-label mb-1">R Ballot Share</div><div className="text-lg font-bold text-red-400">{fmt.pct(detail.rShare)}</div></div>
                  : <MissingField label="R Ballot Share" />
                }
                {detail.dShare != null
                  ? <div className="card-sm"><div className="stat-label mb-1">D Ballot Share</div><div className="text-lg font-bold text-blue-400">{fmt.pct(detail.dShare)}</div></div>
                  : <MissingField label="D Ballot Share" />
                }
                <div className="card-sm">
                  <div className="stat-label mb-1">Total Ballots</div>
                  <div className="text-lg font-bold text-slate-200">{fmt.votes(detail.total)}</div>
                </div>
                {detail.baseline != null
                  ? <div className="card-sm"><div className="stat-label mb-1">Historical Baseline</div><div className="text-lg font-bold text-slate-200">{fmt.pct(detail.baseline)}</div><div className="text-xs text-slate-500 mt-0.5">n={detail.priorShares.length} cycles</div></div>
                  : <div className="card-sm"><div className="stat-label mb-1">Historical Baseline</div><div className="text-lg font-bold text-slate-600">—</div><div className="text-xs text-slate-700 italic mt-0.5">Need ≥2 prior comparable cycles</div></div>
                }
                {detail.shift != null
                  ? <div className="card-sm"><div className="stat-label mb-1">Share Shift</div><div className={`text-lg font-bold ${detail.shift > 0 ? 'text-red-400' : 'text-blue-400'}`}>{fmt.pctPts(detail.shift)}</div></div>
                  : <MissingField label="Share Shift" />
                }
                {detail.zScore != null
                  ? <div className="card-sm"><div className="stat-label mb-1">Z-Score</div><div className={`text-lg font-bold ${stoplightColor(detail.severity).text}`}>{fmt.zScore(detail.zScore)}</div></div>
                  : <MissingField label="Z-Score" />
                }
              </div>

              {detail.turnout != null && (
                <div className="card-sm mb-3">
                  <div className="stat-label mb-1">Turnout Rate</div>
                  <div className="text-lg font-bold text-slate-200">{fmt.pct(detail.turnout)}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Ballots / registered voters (from import)</div>
                </div>
              )}

              {countyTimeline.length > 1 && (
                <>
                  <div className="text-xs font-medium text-slate-400 mb-2">R Ballot Share History</div>
                  <ResponsiveContainer width="100%" height={150}>
                    <LineChart data={countyTimeline} margin={{ top: 2, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="year" tick={{ ...AXIS, fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ ...AXIS, fontSize: 10 }} />
                      <Tooltip {...TT} formatter={(v) => [v != null ? `${Number(v).toFixed(1)}%` : '—', selectedCounty]} />
                      <Line type="monotone" dataKey="rSharePct" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </>
              )}
            </motion.div>
          ) : (
            <div className="card text-sm text-slate-500">
              Click a county on the map to view detailed analysis.
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="section-title">Counties by Deviation — {targetYear}</div>
            <div className="overflow-y-auto max-h-96 -mx-5 px-5">
              {filtered.length === 0 && (
                <p className="text-slate-600 text-sm py-4 italic">No county data for this cycle.</p>
              )}
              {filtered
                .sort((a, b) => Math.abs(b.zScore ?? 0) - Math.abs(a.zScore ?? 0))
                .slice(0, 40)
                .map(c => {
                  const sc = c.severity ? stoplightColor(c.severity) : { dot: '#64748b', text: 'text-slate-500' }
                  return (
                    <button key={c.county}
                      onClick={() => setCounty(c.county === selectedCounty ? null : c.county)}
                      className={`w-full flex items-center justify-between py-2.5 border-b border-navy-700 last:border-0 hover:bg-navy-700/30 transition-colors text-sm ${c.county === selectedCounty ? 'bg-navy-700/50' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: sc.dot }} />
                        <span className="text-slate-200 font-medium">{c.county}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-red-400">{c.rShare != null ? fmt.pct(c.rShare) : '—'}</span>
                        <span className="text-blue-400">{c.dShare != null ? fmt.pct(c.dShare) : '—'}</span>
                        <span className={`font-medium ${c.shift == null ? 'text-slate-600' : c.shift > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                          {c.shift != null ? fmt.pctPts(c.shift) : '—'}
                        </span>
                      </div>
                    </button>
                  )
                })}
            </div>
            <p className="text-xs text-slate-700 italic mt-2">"—" = field absent from imported data, not zero.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
