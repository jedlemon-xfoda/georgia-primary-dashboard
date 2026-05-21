import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ZAxis,
  BarChart, Bar, Cell, ReferenceLine
} from 'recharts'
import useElectionStore from '../../store/electionStore.js'
import EmptyState from '../EmptyState.jsx'
import { fmt, stoplightColor } from '../../utils/formatters.js'
import { Statistics } from '../../services/StatisticsService.js'

const GRID = { stroke: '#1e2d4f', strokeDasharray: '3 3' }
const AXIS = { fill: '#64748b', fontSize: 11 }
const TT   = { contentStyle: { background: '#0c1428', border: '1px solid #273d65', borderRadius: 8, fontSize: 12 }, labelStyle: { color: '#94a3b8' } }

function PSIGauge({ value, label }) {
  const color = value < 25 ? '#22c55e' : value < 50 ? '#f59e0b' : '#ef4444'
  const pct   = Math.min(100, value)
  return (
    <div className="text-center">
      <div className="relative w-28 h-28 mx-auto">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none" stroke="#1e2d4f" strokeWidth="3" />
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${pct}, 100`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xl font-bold" style={{ color }}>{Math.round(value)}</div>
          <div className="text-[10px] text-slate-500">/ 100</div>
        </div>
      </div>
      <div className="text-xs text-slate-300 font-medium mt-1">{label}</div>
      <div className="text-xs mt-0.5" style={{ color }}>
        {value < 25 ? 'Low' : value < 50 ? 'Moderate' : value < 75 ? 'Elevated' : 'High'}
        {' — Possible Behavior Change Indicator'}
      </div>
    </div>
  )
}

export default function ParticipationTab() {
  const hasData   = useElectionStore(s => s.hasData)
  const elections = useElectionStore(s => s.elections)
  const dims      = useElectionStore(s => s.dims)

  // latestYear and psiData must be computed before any conditional return (hooks rules)
  const latestYear = dims.years.filter(y => typeof y === 'number').at(-1) ?? null

  const psiData = useMemo(() => {
    if (!hasData || !elections.length || !latestYear) return []

    const latestMeta     = elections.find(r => r.year === latestYear)
    const comparableType = latestMeta?.comparableType || (latestYear % 4 === 0 ? 'Presidential' : 'Midterm')

    return dims.counties.map(county => {
      const curRecs = elections.filter(r => r.county === county && r.year === latestYear && r.office === 'BALLOT_TOTALS')
      if (!curRecs.length) return null

      const curR     = curRecs.filter(r => r.ballotType === 'Republican').reduce((s, r) => s + r.votes, 0)
      const curD     = curRecs.filter(r => r.ballotType === 'Democratic').reduce((s, r) => s + r.votes, 0)
      const curTotal = curR + curD
      if (curTotal < 100) return null

      const curShare    = curTotal > 0 ? curR / curTotal : null
      const rv          = curRecs[0]?.registeredVoters || 0
      const turnoutRate = rv > 0 ? curTotal / rv : null

      const priorYears = [...new Set(
        elections.filter(r =>
          r.county === county && r.year < latestYear &&
          r.comparableType === comparableType && r.office === 'BALLOT_TOTALS'
        ).map(r => r.year)
      )].sort()

      if (priorYears.length < 2) return null

      const priorShares = priorYears.map(y => {
        const rec = elections.filter(r => r.county === county && r.year === y && r.office === 'BALLOT_TOTALS')
        const R = rec.filter(r => r.ballotType === 'Republican').reduce((s, r) => s + r.votes, 0)
        const D = rec.filter(r => r.ballotType === 'Democratic').reduce((s, r) => s + r.votes, 0)
        const T = R + D; return T > 0 ? R / T : null
      }).filter(v => v != null)

      const priorTurnouts = rv > 0 ? priorYears.map(y => {
        const rec = elections.filter(r => r.county === county && r.year === y && r.office === 'BALLOT_TOTALS')
        const R = rec.filter(r => r.ballotType === 'Republican').reduce((s, r) => s + r.votes, 0)
        const D = rec.filter(r => r.ballotType === 'Democratic').reduce((s, r) => s + r.votes, 0)
        const T = R + D
        const pRV = rec[0]?.registeredVoters || rv
        return pRV > 0 ? T / pRV : null
      }).filter(v => v != null) : []

      if (priorShares.length < 2) return null

      const shareMean   = Statistics.mean(priorShares)
      const shareSD     = Statistics.sampleStdDev(priorShares) || 0.01
      const ballotSelZ  = curShare != null ? Statistics.zScore(curShare, shareMean, shareSD) : 0

      const turnoutMean = priorTurnouts.length >= 2 ? Statistics.mean(priorTurnouts) : null
      const turnoutSD   = priorTurnouts.length >= 2 ? (Statistics.sampleStdDev(priorTurnouts) || 0.01) : null
      const turnoutZ    = (turnoutRate != null && turnoutMean != null && turnoutSD != null)
        ? Statistics.zScore(turnoutRate, turnoutMean, turnoutSD)
        : 0

      const psi = Statistics.participationShiftIndex({
        ballotSelectionZ:  ballotSelZ,
        turnoutZ:          turnoutZ,
        countyDivergenceZ: ballotSelZ,
      })

      return {
        county,
        psi,
        psiLabel: Statistics.psiLabel(psi),
        severity: Statistics.psiSeverity(psi),
        ballotSelectionZ: ballotSelZ,
        turnoutZ,
        curShare,
        turnoutRate,
        shareMean,
        turnoutMean,
        shareShift: curShare != null ? curShare - shareMean : null,
        turnoutShift: (turnoutRate != null && turnoutMean != null) ? turnoutRate - turnoutMean : null,
        turnoutAvailable: turnoutMean != null,
        n: priorShares.length,
      }
    }).filter(Boolean).sort((a, b) => b.psi - a.psi)
  }, [hasData, elections, latestYear])

  if (!hasData) return <EmptyState />

  const avgPSI  = psiData.length ? Statistics.mean(psiData.map(d => d.psi)) || 0 : 0
  const highPSI = psiData.filter(d => d.severity !== 'GREEN')
  const turnoutMissingCount = psiData.filter(d => !d.turnoutAvailable).length

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-slate-100">Participation Shift Analysis</h2>
        <p className="text-sm text-slate-400 mt-1">
          The Participation Shift Index (PSI) measures deviation from historical baselines derived from your imported data.
          It is a possible behavior change indicator — it does not determine cause or establish crossover voting occurred.
        </p>
      </div>

      {psiData.length === 0 && (
        <EmptyState context="PSI calculation (need ≥2 prior comparable cycles in import)" minimal />
      )}

      {turnoutMissingCount > 0 && psiData.length > 0 && (
        <div className="mb-4 p-3 bg-navy-700/40 border border-navy-500 rounded-lg text-xs text-slate-400">
          <strong className="text-slate-300">Turnout component unavailable for {turnoutMissingCount} counties.</strong> To include the turnout dimension in PSI,
          import registered voter counts via the <strong>Voter / Census Context</strong> import tab or include a <code className="text-indigo-400">registered_voters</code> column in your election data.
          Voter registration is used only as a turnout denominator — never as a partisan attribute.
        </div>
      )}

      {psiData.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
            <div className="card col-span-1 flex flex-col items-center justify-center py-6">
              <PSIGauge value={avgPSI} label={`Statewide PSI — ${latestYear}`} />
            </div>
            <div className="card col-span-2">
              <div className="section-title">PSI Formula & Components</div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                {[
                  { label: 'Ballot-Selection Z', weight: '40%', desc: 'R ballot share vs. comparable historical baseline' },
                  { label: 'Turnout Z',           weight: '30%', desc: 'Total ballot participation vs. historical (requires registered voter data)' },
                  { label: 'County Divergence Z', weight: '30%', desc: 'County deviation relative to its own baseline' },
                ].map(item => (
                  <div key={item.label} className="card-sm">
                    <div className="stat-label mb-1">{item.label}</div>
                    <div className="text-lg font-bold text-indigo-400">{item.weight}</div>
                    <div className="text-xs text-slate-500 mt-1">{item.desc}</div>
                  </div>
                ))}
              </div>
              <div className="bg-navy-700/50 rounded-lg px-4 py-3 font-mono text-xs text-indigo-300">
                PSI = min(100, (|ballotSelectionZ| × 0.40 + |turnoutZ| × 0.30 + |countyDivergenceZ| × 0.30) × 33.33)
              </div>
              <div className="mt-3 flex gap-4 text-xs">
                {[
                  { color: 'text-emerald-400', label: '0–25: Low' },
                  { color: 'text-amber-400',   label: '25–50: Moderate' },
                  { color: 'text-orange-400',  label: '50–75: Elevated' },
                  { color: 'text-red-400',     label: '75–100: High' },
                ].map(({ color, label }) => <span key={label} className={color}>{label}</span>)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="card">
              <div className="section-title">PSI by County — Top Flagged</div>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart
                  data={psiData.slice(0, 30).reverse()}
                  layout="vertical"
                  margin={{ top: 4, right: 30, bottom: 0, left: 80 }}
                >
                  <CartesianGrid {...GRID} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={AXIS} />
                  <YAxis type="category" dataKey="county" tick={{ ...AXIS, fontSize: 10 }} width={75} />
                  <Tooltip {...TT}
                    formatter={(v, _, props) => [`${Number(v).toFixed(1)} — ${props.payload?.psiLabel}`, 'Participation Shift Index']} />
                  <ReferenceLine x={25} stroke="#22c55e" strokeDasharray="3 3" />
                  <ReferenceLine x={50} stroke="#f59e0b" strokeDasharray="3 3" />
                  <ReferenceLine x={75} stroke="#ef4444" strokeDasharray="3 3" />
                  <Bar dataKey="psi" radius={[0, 3, 3, 0]}>
                    {psiData.slice(0, 30).reverse().map((d, i) => (
                      <Cell key={i} fill={d.severity === 'RED' ? '#ef4444' : d.severity === 'YELLOW' ? '#f59e0b' : '#22c55e'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="section-title">Ballot Selection vs. Turnout Deviation</div>
              <p className="text-xs text-slate-500 mb-1">
                Each point = one county. Position shows deviation from historical baseline on both dimensions.
                {turnoutMissingCount > 0 && <span className="text-slate-600"> Turnout axis unavailable for {turnoutMissingCount} counties — those are plotted at y=0.</span>}
              </p>
              <ResponsiveContainer width="100%" height={340}>
                <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="shareShift" type="number" name="R Ballot Share Shift"
                    tickFormatter={v => fmt.pctPts(v)} tick={AXIS}
                    label={{ value: 'R Ballot Share Shift (from baseline)', position: 'insideBottom', offset: -15, fill: '#64748b', fontSize: 10 }} />
                  <YAxis dataKey="turnoutShift" type="number" name="Turnout Shift"
                    tickFormatter={v => v != null ? fmt.pctPts(v) : '—'} tick={AXIS}
                    label={{ value: 'Turnout Shift', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }} />
                  <ZAxis dataKey="psi" range={[30, 200]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }}
                    content={({ payload }) => {
                      if (!payload?.length) return null
                      const d = payload[0]?.payload
                      return (
                        <div className="bg-navy-800 border border-navy-500 rounded-lg p-3 text-xs">
                          <div className="font-semibold text-slate-200 mb-1">{d.county}</div>
                          <div className="text-slate-400">R Share Shift: <span className="text-slate-200">{d.shareShift != null ? fmt.pctPts(d.shareShift) : '—'}</span></div>
                          <div className="text-slate-400">Turnout Shift: <span className={d.turnoutAvailable ? 'text-slate-200' : 'text-slate-600 italic'}>{d.turnoutShift != null ? fmt.pctPts(d.turnoutShift) : 'Not available'}</span></div>
                          <div className="text-slate-400">PSI: <span className="text-slate-200">{d.psi?.toFixed(1)}</span></div>
                        </div>
                      )
                    }}
                  />
                  <ReferenceLine x={0} stroke="#475569" />
                  <ReferenceLine y={0} stroke="#475569" />
                  <Scatter data={psiData} fill="#6366f1" opacity={0.7} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {highPSI.length > 0 && (
              <div className="card xl:col-span-2">
                <div className="section-title">Flagged Counties — PSI Above Low Threshold</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500 border-b border-navy-500">
                        <th className="text-left py-2 pr-4">County</th>
                        <th className="text-right py-2 pr-4">PSI</th>
                        <th className="text-right py-2 pr-4">Level</th>
                        <th className="text-right py-2 pr-4">R Share</th>
                        <th className="text-right py-2 pr-4">Baseline</th>
                        <th className="text-right py-2 pr-4">Share Shift</th>
                        <th className="text-right py-2 pr-4">Ballot-Sel. Z</th>
                        <th className="text-right py-2 pr-4">Turnout Z</th>
                        <th className="text-right py-2">n (cycles)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {highPSI.map(d => (
                        <tr key={d.county} className="border-b border-navy-700 hover:bg-navy-700/30">
                          <td className="py-2 pr-4 text-slate-200 font-medium">{d.county}</td>
                          <td className="py-2 pr-4 text-right font-bold" style={{ color: d.severity === 'RED' ? '#ef4444' : '#f59e0b' }}>
                            {d.psi.toFixed(1)}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${d.severity === 'RED' ? 'bg-red-900/40 text-red-400' : 'bg-amber-900/40 text-amber-400'}`}>
                              {d.psiLabel}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-right text-red-400">{d.curShare != null ? fmt.pct(d.curShare) : '—'}</td>
                          <td className="py-2 pr-4 text-right text-slate-400">{fmt.pct(d.shareMean)}</td>
                          <td className={`py-2 pr-4 text-right font-medium ${d.shareShift == null ? 'text-slate-600' : d.shareShift > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                            {d.shareShift != null ? fmt.pctPts(d.shareShift) : '—'}
                          </td>
                          <td className="py-2 pr-4 text-right text-slate-300">{fmt.zScore(d.ballotSelectionZ)}</td>
                          <td className={`py-2 pr-4 text-right ${d.turnoutAvailable ? 'text-slate-300' : 'text-slate-600 italic'}`}>
                            {d.turnoutAvailable ? fmt.zScore(d.turnoutZ) : '—'}
                          </td>
                          <td className="py-2 text-right text-slate-400">{d.n}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-600 italic mt-2">"—" = field absent from imported data, not zero.</p>
              </div>
            )}
          </div>

          <div className="mt-6 p-4 bg-navy-700/30 border border-navy-500 rounded-lg text-xs text-slate-400">
            <strong className="text-slate-300">Note:</strong> The Participation Shift Index reflects deviation from historical baselines in your imported data only.
            Elevated scores may result from candidate competitiveness, campaign mobilization, demographic changes, or many other factors.
            PSI does not establish crossover voting occurred, does not imply voter intent, and does not determine causation.
          </div>
        </>
      )}
    </div>
  )
}
