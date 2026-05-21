import { motion } from 'framer-motion'
import useElectionStore from '../../store/electionStore.js'
import { fmt } from '../../utils/formatters.js'

function Card({ label, value, sub, color = 'text-slate-100', trend, index, missing = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="card"
    >
      <div className="stat-label mb-2">{label}</div>
      <div className={`stat-value ${missing ? 'text-slate-600' : color}`}>
        {missing ? '—' : value}
      </div>
      {missing && (
        <div className="text-xs text-slate-600 mt-1.5 italic">Not in imported data</div>
      )}
      {!missing && sub && (
        <div className="text-xs text-slate-500 mt-1.5">{sub}</div>
      )}
      {!missing && trend != null && (
        <div className={`text-xs font-medium mt-2 ${trend > 0 ? 'text-red-400' : trend < 0 ? 'text-blue-400' : 'text-slate-500'}`}>
          {trend > 0 ? '▲' : trend < 0 ? '▼' : '—'} {fmt.deviation(Math.abs(trend))} vs. prior comparable cycle
        </div>
      )}
    </motion.div>
  )
}

export default function SummaryCards() {
  const timeline  = useElectionStore(s => s.statewideTimeline)
  const anomalies = useElectionStore(s => s.anomalies)
  const dims      = useElectionStore(s => s.dims)
  const hasData   = useElectionStore(s => s.hasData)

  const latest = timeline[timeline.length - 1]
  const prev   = (() => {
    if (!latest || timeline.length < 2) return null
    return timeline.filter(t => t.comparableType === latest.comparableType && t.year < latest.year).at(-1)
  })()

  const redCount    = anomalies.filter(a => a.severity === 'RED').length
  const yellowCount = anomalies.filter(a => a.severity === 'YELLOW').length
  const ballotAnomalies  = anomalies.filter(a => a.category === 3)
  const turnoutAnomalies = anomalies.filter(a => a.category === 2)

  const avgBallotZ  = ballotAnomalies.length
    ? (ballotAnomalies.reduce((s, a) => s + Math.abs(a.zScore || 0), 0) / ballotAnomalies.length).toFixed(2)
    : null
  const avgTurnoutZ = turnoutAnomalies.length
    ? (turnoutAnomalies.reduce((s, a) => s + Math.abs(a.zScore || 0), 0) / turnoutAnomalies.length).toFixed(2)
    : null

  const rShiftPts = (latest?.rShare != null && prev?.rShare != null)
    ? latest.rShare - prev.rShare
    : null

  const cards = [
    {
      label: 'Republican Ballot Selections',
      value: latest ? fmt.votes(latest.R) : '—',
      sub: latest ? `${fmt.pct(latest.rShare)} of primary ballots · ${latest.year}` : null,
      color: 'text-red-400',
      trend: rShiftPts,
      missing: !latest,
    },
    {
      label: 'Democratic Ballot Selections',
      value: latest ? fmt.votes(latest.D) : '—',
      sub: latest ? `${fmt.pct(latest.dShare)} of primary ballots · ${latest.year}` : null,
      color: 'text-blue-400',
      trend: rShiftPts != null ? -rShiftPts : null,
      missing: !latest,
    },
    {
      label: 'Total Primary Ballots',
      value: latest ? fmt.votes(latest.total) : '—',
      sub: latest ? `${dims.counties.length} counties · ${latest.electionType}` : null,
      color: 'text-slate-100',
      missing: !latest,
    },
    {
      label: 'Ballot Share Shift',
      value: rShiftPts != null ? fmt.pctPts(rShiftPts) : '—',
      sub: prev ? `R ballot share vs. ${prev.year} comparable cycle` : null,
      color: rShiftPts == null ? 'text-slate-400' : rShiftPts > 0 ? 'text-red-400' : 'text-blue-400',
      // missing only if both cycles present but share is null
      missing: !latest || !prev,
    },
    {
      label: 'County Divergence Score',
      value: avgBallotZ != null ? `${avgBallotZ}σ` : '—',
      sub: `Avg ballot-selection deviation · ${ballotAnomalies.length} counties flagged`,
      color: avgBallotZ != null && avgBallotZ >= 2 ? 'text-amber-400' : 'text-slate-100',
      missing: !hasData,
    },
    {
      label: 'Participation Deviation',
      value: avgTurnoutZ != null ? `${avgTurnoutZ}σ` : '—',
      sub: `Avg turnout deviation from baseline · ${turnoutAnomalies.length} counties`,
      color: avgTurnoutZ != null && avgTurnoutZ >= 2 ? 'text-amber-400' : 'text-slate-100',
      missing: !hasData || turnoutAnomalies.length === 0,
    },
    {
      label: 'Anomaly Count',
      value: hasData ? String(anomalies.length) : '—',
      sub: hasData
        ? `${redCount} RED · ${yellowCount} YELLOW · ${dims.years.length} election cycles`
        : null,
      color: redCount > 0 ? 'text-red-400' : yellowCount > 0 ? 'text-amber-400' : 'text-emerald-400',
      missing: !hasData,
    },
    {
      label: 'Open Primary Indicator',
      value: 'Active',
      sub: 'Georgia has no party registration · Voters self-select ballot type · O.C.G.A. § 21-2-224',
      color: 'text-indigo-400',
      missing: false,
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
      {cards.map((card, i) => (
        <Card key={card.label} {...card} index={i} />
      ))}
    </div>
  )
}
