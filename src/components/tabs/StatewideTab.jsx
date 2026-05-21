import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart,
  Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Area, AreaChart
} from 'recharts'
import useElectionStore from '../../store/electionStore.js'
import SummaryCards from '../cards/SummaryCards.jsx'
import EmptyState from '../EmptyState.jsx'
import { fmt } from '../../utils/formatters.js'

const GRID    = { stroke: '#1e2d4f', strokeDasharray: '3 3' }
const AXIS    = { fill: '#64748b', fontSize: 11 }
const TT_STYLE = { contentStyle: { background: '#0c1428', border: '1px solid #273d65', borderRadius: 8, fontSize: 12 }, labelStyle: { color: '#94a3b8' } }

function ChartCard({ title, note, children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card">
      <div className="section-title">{title}</div>
      {children}
      {note && <p className="text-xs text-slate-500 mt-2">{note}</p>}
    </motion.div>
  )
}

export default function StatewideTab() {
  const hasData   = useElectionStore(s => s.hasData)
  // statewideTimeline is precomputed by the store on every elections change.
  // It already includes: yearLabel, rSharePct, dSharePct, rShift, dShift, rProxy, dProxy.
  // This component does zero raw-data scanning — all charts read this array directly.
  const timeline  = useElectionStore(s => s.statewideTimeline)
  const dims      = useElectionStore(s => s.dims)
  const setFilter = useElectionStore(s => s.setFilter)
  const filters   = useElectionStore(s => s.filters)

  console.debug(`[Perf] StatewideTab render — ${timeline.length} precomputed rows, no local scan`)

  const [view, setView] = useState('votes')

  if (!hasData) return <EmptyState />

  const electionTypes = ['All', ...dims.types]

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      <SummaryCards />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div>
          <label className="stat-label block mb-1">View</label>
          <select value={view} onChange={e => setView(e.target.value)} className="filter-select">
            <option value="votes">Raw Votes</option>
            <option value="share">Ballot Share %</option>
            <option value="shift">Shift from Prior Comparable</option>
          </select>
        </div>
        <div>
          <label className="stat-label block mb-1">Election Type</label>
          <select value={filters.electionType || 'All'} onChange={e => setFilter('electionType', e.target.value)} className="filter-select">
            {electionTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {timeline.length === 0 && (
        <EmptyState context="statewide ballot totals" minimal />
      )}

      {timeline.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          <ChartCard
            title="Primary Ballot Selections by Cycle"
            note={view === 'shift'
              ? 'Shift measured against prior comparable cycle (presidential vs. presidential, midterm vs. midterm).'
              : 'Total ballots selected by primary voters per cycle. Source: imported election data.'}
          >
            {view === 'votes' ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={timeline} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="yearLabel" tick={AXIS} />
                  <YAxis tickFormatter={v => fmt.votes(v)} tick={AXIS} />
                  <Tooltip {...TT_STYLE}
                    formatter={(v, name) => [fmt.number(v), name === 'R' ? 'Republican Ballots' : 'Democratic Ballots']} />
                  <Legend formatter={v => v === 'R' ? 'Republican Ballots' : 'Democratic Ballots'} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="R" fill="#ef4444" radius={[3, 3, 0, 0]} name="R" />
                  <Bar dataKey="D" fill="#3b82f6" radius={[3, 3, 0, 0]} name="D" />
                </BarChart>
              </ResponsiveContainer>
            ) : view === 'share' ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={timeline} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="yearLabel" tick={AXIS} />
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={AXIS} />
                  <Tooltip {...TT_STYLE}
                    formatter={(v, name) => [
                      v != null ? `${Number(v).toFixed(1)}%` : '—',
                      name === 'rSharePct' ? 'Republican Ballot Share' : 'Democratic Ballot Share'
                    ]} />
                  <Area type="monotone" dataKey="rSharePct" stackId="1" fill="#ef4444" stroke="#ef4444" fillOpacity={0.5} name="rSharePct" />
                  <Area type="monotone" dataKey="dSharePct" stackId="1" fill="#3b82f6" stroke="#3b82f6" fillOpacity={0.5} name="dSharePct" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={timeline} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="yearLabel" tick={AXIS} />
                  <YAxis tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`} tick={AXIS} />
                  <Tooltip {...TT_STYLE}
                    formatter={(v, name) => [
                      v != null ? `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%` : '—',
                      name === 'rShift' ? 'R Share Shift vs. Comparable Prior' : 'D Share Shift vs. Comparable Prior'
                    ]} />
                  <Bar dataKey="rShift" fill="#ef4444" radius={[3, 3, 0, 0]} name="rShift" />
                  <Bar dataKey="dShift" fill="#3b82f6" radius={[3, 3, 0, 0]} name="dShift" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard
            title="Republican vs. Democratic Ballot Share Trend"
            note="Patterns may reflect candidate competitiveness, turnout dynamics, or other factors. No causation is established."
          >
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={timeline} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="yearLabel" tick={AXIS} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={AXIS} />
                <Tooltip {...TT_STYLE}
                  formatter={(v, name) => [
                    v != null ? `${Number(v).toFixed(1)}%` : '—',
                    name === 'rSharePct' ? 'Republican Ballot Share' : 'Democratic Ballot Share'
                  ]} />
                <Legend formatter={v => v === 'rSharePct' ? 'Republican Ballot Share' : 'Democratic Ballot Share'} wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="rSharePct" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 4 }} name="rSharePct" connectNulls={false} />
                <Line type="monotone" dataKey="dSharePct" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} name="dSharePct" connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Total Primary Ballot Participation">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={timeline} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="yearLabel" tick={AXIS} />
                <YAxis tickFormatter={v => fmt.votes(v)} tick={AXIS} />
                <Tooltip {...TT_STYLE} formatter={(v) => [fmt.number(v), 'Total Primary Ballots']} />
                <Area type="monotone" dataKey="total" fill="#6366f1" stroke="#6366f1" fillOpacity={0.2} strokeWidth={2} dot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Cycle Summary Table">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-navy-500">
                    <th className="text-left py-2 pr-4">Year</th>
                    <th className="text-left py-2 pr-4">Type</th>
                    <th className="text-right py-2 pr-4">R Ballots</th>
                    <th className="text-right py-2 pr-4">D Ballots</th>
                    <th className="text-right py-2 pr-4">Total</th>
                    <th className="text-right py-2 pr-4">R Share</th>
                    <th className="text-right py-2">vs. Prior</th>
                    <th className="text-left py-2 pl-4">Proxy Race</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.map(row => (
                    <tr key={row.year} className="border-b border-navy-700 hover:bg-navy-700/30 transition-colors">
                      <td className="py-2 pr-4 text-slate-200 font-medium">{row.year}</td>
                      <td className="py-2 pr-4 text-slate-400">{row.electionType?.replace(' Primary', '') || '—'}</td>
                      <td className="py-2 pr-4 text-right text-red-400">{fmt.votes(row.R)}</td>
                      <td className="py-2 pr-4 text-right text-blue-400">{fmt.votes(row.D)}</td>
                      <td className="py-2 pr-4 text-right text-slate-300">{fmt.votes(row.total)}</td>
                      <td className="py-2 pr-4 text-right text-slate-300">{row.rShare != null ? fmt.pct(row.rShare) : '—'}</td>
                      <td className={`py-2 text-right font-medium ${
                        row.rShift == null ? 'text-slate-600' :
                        row.rShift > 0.5 ? 'text-red-400' : row.rShift < -0.5 ? 'text-blue-400' : 'text-slate-400'
                      }`}>
                        {row.rShift != null ? `${row.rShift > 0 ? '+' : ''}${row.rShift.toFixed(1)}%` : '—'}
                      </td>
                      <td className="py-2 pl-4 text-left text-slate-500"
                        title={[row.rProxy && `R: ${row.rProxy}`, row.dProxy && `D: ${row.dProxy}`].filter(Boolean).join(' / ') || undefined}>
                        {row.rProxy || row.dProxy
                          ? (row.rProxy === row.dProxy
                              ? row.rProxy
                              : [row.rProxy, row.dProxy].filter(Boolean).join(' / '))
                            .replace(/^U\.?S\.?\s+Senate/i, 'US Senate')
                            .slice(0, 22)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-600 mt-2 italic">"—" = value absent from imported data, not zero. Proxy Race: the highest-turnout statewide contest used as ballot total proxy per party — hover a cell for R/D detail.</p>
          </ChartCard>
        </div>
      )}
    </div>
  )
}
