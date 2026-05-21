import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useElectionStore from '../../store/electionStore.js'
import EmptyState from '../EmptyState.jsx'
import { fmt, stoplightColor, anomalyCategory } from '../../utils/formatters.js'
import { ENGINE_METADATA } from '../../services/AnomalyEngine.js'

function StoplightDot({ severity }) {
  const colors = { GREEN: 'bg-emerald-400', YELLOW: 'bg-amber-400', RED: 'bg-red-400' }
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[severity] || 'bg-slate-500'} ${severity === 'RED' ? 'animate-pulse' : ''}`} />
  )
}

function AnomalyCard({ anomaly, expanded, onToggle }) {
  const sc  = stoplightColor(anomaly.severity)
  const cat = anomalyCategory[anomaly.category] || {}

  const isPercent = anomaly.metric?.match(/share|rate|fraction|pct|percent/i)
  const fmtVal = (v) => {
    if (v == null) return '—'
    if (typeof v !== 'number') return String(v)
    return isPercent ? fmt.pct(v) : fmt.number(v, 3)
  }

  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className={`border rounded-xl mb-3 overflow-hidden ${sc.bg} ${sc.border}`}>
      <button onClick={onToggle} className="w-full text-left p-4">
        <div className="flex items-start gap-3">
          <StoplightDot severity={anomaly.severity} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className={`text-xs font-semibold uppercase tracking-wider ${sc.text}`}>{anomaly.severity}</span>
                <span className="text-slate-500 text-xs ml-2">Cat. {anomaly.category} — {cat.label}</span>
                <span className="text-slate-600 text-xs ml-2">{anomaly.id}</span>
              </div>
              <div className="text-slate-500 text-xs shrink-0">{anomaly.year}</div>
            </div>
            <div className="text-sm font-semibold text-slate-200 mt-1">{anomaly.jurisdiction}</div>
            <div className="text-xs text-slate-400 mt-0.5">{anomaly.race}</div>
            <div className="flex flex-wrap gap-4 mt-3 text-xs">
              <div><span className="text-slate-500">Expected: </span><span className="text-slate-300 font-medium">{fmtVal(anomaly.expected)}</span></div>
              <div><span className="text-slate-500">Observed: </span><span className={`font-medium ${sc.text}`}>{fmtVal(anomaly.actual)}</span></div>
              <div><span className="text-slate-500">Deviation: </span><span className={`font-medium ${sc.text}`}>{anomaly.deviation != null ? `${anomaly.deviation > 0 ? '+' : ''}${(anomaly.deviation * 100).toFixed(2)} pts` : '—'}</span></div>
              <div><span className="text-slate-500">Z-score: </span><span className="text-slate-300 font-medium">{fmt.zScore(anomaly.zScore)}</span></div>
              <div><span className="text-slate-500">n: </span><span className="text-slate-300">{anomaly.n}</span></div>
              <div><span className="text-slate-500">Confidence: </span><span className="text-slate-300">{anomaly.confidence != null ? `${(anomaly.confidence * 100).toFixed(0)}%` : '—'}</span></div>
            </div>
          </div>
          <div className="text-slate-600 mt-1 text-lg">{expanded ? '▲' : '▼'}</div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 pt-1 border-t border-navy-600/50 space-y-4">
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Neutral Explanation</div>
                <p className="text-sm text-slate-300">{anomaly.explanation}</p>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Metric</div>
                <p className="text-sm text-slate-300">{anomaly.metric}</p>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Formula Used</div>
                <code className="block bg-navy-800 rounded-lg px-3 py-2 text-xs text-indigo-300 font-mono">{anomaly.formula}</code>
              </div>
              {anomaly.assumptions?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Assumptions</div>
                  <ul className="space-y-1">
                    {anomaly.assumptions.map((a, i) => (
                      <li key={i} className="text-xs text-slate-400 flex gap-2"><span className="text-slate-600 shrink-0">·</span>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {anomaly.historicalValues?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Historical Baseline Values (from import)</div>
                  <div className="flex flex-wrap gap-2">
                    {anomaly.historicalValues.map(({ year, value }) => (
                      <div key={year} className="bg-navy-800 rounded-lg px-3 py-1.5 text-xs">
                        <span className="text-slate-500">{year}: </span>
                        <span className="text-slate-300">{fmtVal(value)}</span>
                      </div>
                    ))}
                    <div className={`rounded-lg px-3 py-1.5 text-xs border ${sc.border}`}>
                      <span className="text-slate-500">{anomaly.year} (obs.): </span>
                      <span className={`font-bold ${sc.text}`}>{fmtVal(anomaly.actual)}</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="bg-navy-800/60 rounded-lg px-3 py-2 text-xs text-slate-500">
                Confidence {(anomaly.confidence * 100).toFixed(0)}% based on baseline sample size (n={anomaly.n}) and z-score (|z|={Math.abs(anomaly.zScore ?? 0).toFixed(2)}).
                Formula: confidence = 0.6 × min(1, (n−1)/4) + 0.4 × min(1, |z|/4).
                All values derived exclusively from imported data — no estimation applied.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function AnomalyTab() {
  const hasData   = useElectionStore(s => s.hasData)
  const anomalies = useElectionStore(s => s.anomalies)
  const dims      = useElectionStore(s => s.dims)

  const [filterCat,  setCat]  = useState('All')
  const [filterSev,  setSev]  = useState('All')
  const [filterYear, setYear] = useState('All')
  const [expandedId, setExpanded] = useState(null)

  if (!hasData) return <EmptyState />

  const years = useMemo(() => ['All', ...new Set(anomalies.map(a => a.year).filter(Boolean))].sort(), [anomalies])

  const filtered = useMemo(() => anomalies.filter(a => {
    if (filterCat  !== 'All' && String(a.category) !== filterCat) return false
    if (filterSev  !== 'All' && a.severity !== filterSev)          return false
    if (filterYear !== 'All' && String(a.year) !== filterYear)     return false
    return true
  }), [anomalies, filterCat, filterSev, filterYear])

  const counts = {
    RED:    anomalies.filter(a => a.severity === 'RED').length,
    YELLOW: anomalies.filter(a => a.severity === 'YELLOW').length,
    total:  anomalies.length,
  }

  // Explain why the engine may have found nothing
  const noCyclesMsg = dims.years.length < 2
    ? `Only ${dims.years.length} election cycle${dims.years.length === 1 ? '' : 's'} imported. The anomaly engine requires at least 2 comparable cycles to generate a baseline. Import additional cycles to enable analysis.`
    : null

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Stoplight Anomaly Report</h2>
          <p className="text-sm text-slate-400 mt-1">
            Generated from imported data only. Flags measurable statistical deviations for additional review.
            No causation is established by any flag. No anomalies are artificially injected.
          </p>
        </div>
        <div className="flex gap-3">
          {[
            { label: `${counts.RED} RED`,     cls: 'badge-red',    val: 'RED' },
            { label: `${counts.YELLOW} YEL`,  cls: 'badge-yellow', val: 'YELLOW' },
            { label: `${counts.total} Total`, cls: 'text-xs px-2 py-0.5 rounded border border-navy-400 text-slate-400', val: 'All' },
          ].map(({ label, cls, val }) => (
            <button key={val} onClick={() => setSev(filterSev === val ? 'All' : val)}
              className={`${cls} cursor-pointer ${filterSev === val ? 'ring-2 ring-indigo-400' : ''}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {noCyclesMsg && (
        <div className="card mb-6 p-4 border-amber-700/40 bg-amber-900/20">
          <p className="text-sm text-amber-300">{noCyclesMsg}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-6">
        <div>
          <label className="stat-label block mb-1">Category</label>
          <select value={filterCat} onChange={e => setCat(e.target.value)} className="filter-select">
            <option value="All">All Categories</option>
            {ENGINE_METADATA.categories.map(c => (
              <option key={c.id} value={String(c.id)}>{c.id}. {c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="stat-label block mb-1">Severity</label>
          <select value={filterSev} onChange={e => setSev(e.target.value)} className="filter-select">
            <option value="All">All Severities</option>
            <option value="RED">RED</option>
            <option value="YELLOW">YELLOW</option>
          </select>
        </div>
        <div>
          <label className="stat-label block mb-1">Election Year</label>
          <select value={filterYear} onChange={e => setYear(e.target.value)} className="filter-select">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="self-end text-xs text-slate-500">
          Showing {filtered.length} of {anomalies.length} flags
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-6">
        {ENGINE_METADATA.categories.map(cat => {
          const catAnomalies = anomalies.filter(a => a.category === cat.id)
          const reds = catAnomalies.filter(a => a.severity === 'RED').length
          return (
            <button key={cat.id}
              onClick={() => setCat(filterCat === String(cat.id) ? 'All' : String(cat.id))}
              className={`card-sm text-left transition-all ${filterCat === String(cat.id) ? 'ring-1 ring-indigo-400' : 'hover:border-navy-400'}`}
            >
              <div className="text-[10px] text-slate-500 mb-1">Cat {cat.id}</div>
              <div className="text-sm font-bold text-slate-200">{catAnomalies.length}</div>
              <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{cat.name}</div>
              {reds > 0 && <div className="text-[10px] text-red-400 mt-1">{reds} RED</div>}
            </button>
          )
        })}
      </div>

      {filtered.length === 0 && !noCyclesMsg && (
        <div className="card text-center py-12 text-slate-500">
          No anomalies match current filters.
          {anomalies.length === 0 && ' The engine found no deviations exceeding threshold in imported data.'}
        </div>
      )}

      {filtered.map(a => (
        <AnomalyCard key={a.id} anomaly={a}
          expanded={expandedId === a.id}
          onToggle={() => setExpanded(expandedId === a.id ? null : a.id)} />
      ))}

      <div className="mt-6 p-4 bg-navy-700/30 border border-navy-500 rounded-lg text-xs text-slate-400">
        <strong className="text-slate-300">Engine v{ENGINE_METADATA.version}</strong> · {ENGINE_METADATA.neutralityGuarantee}
      </div>
    </div>
  )
}
