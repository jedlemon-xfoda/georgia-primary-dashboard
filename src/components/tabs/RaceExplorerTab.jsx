import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts'
import useElectionStore from '../../store/electionStore.js'
import EmptyState from '../EmptyState.jsx'
import { fmt } from '../../utils/formatters.js'
import { isCandidateRecord } from '../../utils/candidateFilter.js'

const GRID = { stroke: '#1e2d4f', strokeDasharray: '3 3' }
const AXIS = { fill: '#64748b', fontSize: 11 }
const TT   = { contentStyle: { background: '#0c1428', border: '1px solid #273d65', borderRadius: 8, fontSize: 12 }, labelStyle: { color: '#94a3b8' } }

export default function RaceExplorerTab() {
  const hasData   = useElectionStore(s => s.hasData)
  const elections = useElectionStore(s => s.elections)
  const dims      = useElectionStore(s => s.dims)

  const [searchCandidate, setSearchCand] = useState('')
  const [selectedCounty,  setCounty]    = useState('All')
  const [selectedOffice,  setOffice]    = useState('All')
  const [selectedYear,    setYear]      = useState('All')
  const [selectedParty,   setParty]     = useState('All')

  const filtered = useMemo(() => {
    return elections.filter(r => {
      if (!isCandidateRecord(r)) return false
      if (searchCandidate && !r.candidate.toLowerCase().includes(searchCandidate.toLowerCase())) return false
      if (selectedCounty !== 'All' && r.county !== selectedCounty) return false
      if (selectedOffice !== 'All' && r.office !== selectedOffice) return false
      if (selectedYear   !== 'All' && String(r.year) !== selectedYear) return false
      if (selectedParty  !== 'All' && r.candidateParty !== selectedParty) return false
      return true
    })
  }, [elections, searchCandidate, selectedCounty, selectedOffice, selectedYear, selectedParty])

  // Group by candidate for a summary view
  const candidateSummary = useMemo(() => {
    const m = new Map()
    for (const r of filtered) {
      const key = `${r.candidate}||${r.candidateParty}||${r.office}||${r.year}`
      if (!m.has(key)) m.set(key, {
        candidate: r.candidate, party: r.candidateParty, office: r.office, year: r.year,
        totalVotes: 0, counties: new Set(), electionDate: r.electionDate
      })
      const row = m.get(key)
      row.totalVotes += r.votes
      row.counties.add(r.county)
    }
    return [...m.values()]
      .map(r => ({ ...r, countyCount: r.counties.size }))
      .sort((a, b) => b.totalVotes - a.totalVotes)
      .slice(0, 50)
  }, [filtered])

  // Race results for selected office/year
  const raceResults = useMemo(() => {
    if (selectedOffice === 'All' || selectedYear === 'All') return []
    const recs = elections.filter(r =>
      isCandidateRecord(r) &&
      r.office === selectedOffice &&
      String(r.year) === selectedYear &&
      (selectedCounty === 'All' || r.county === selectedCounty)
    )
    const byCandidate = new Map()
    for (const r of recs) {
      const k = `${r.candidate}||${r.candidateParty}`
      if (!byCandidate.has(k)) byCandidate.set(k, { candidate: r.candidate, party: r.candidateParty, votes: 0 })
      byCandidate.get(k).votes += r.votes
    }
    const arr = [...byCandidate.values()].sort((a, b) => b.votes - a.votes)
    const total = arr.reduce((s, r) => s + r.votes, 0)
    return arr.map(r => ({ ...r, share: total > 0 ? r.votes / total : 0 }))
  }, [elections, selectedOffice, selectedYear, selectedCounty])

  // Vote method breakdown
  const voteMethodBreakdown = useMemo(() => {
    if (selectedOffice === 'All' || selectedYear === 'All') return []
    const recs = elections.filter(r =>
      r.office === 'BALLOT_TOTALS' &&
      String(r.year) === selectedYear &&
      (selectedCounty === 'All' || r.county === selectedCounty)
    )
    const methods = { 'Election Day': 0, 'Early Voting': 0, 'Absentee': 0 }
    for (const r of recs) {
      methods['Election Day'] += r.electionDayVotes || 0
      methods['Early Voting'] += r.earlyVotes       || 0
      methods['Absentee']     += r.absenteeVotes    || 0
    }
    return Object.entries(methods).map(([name, value]) => ({ name, value })).filter(r => r.value > 0)
  }, [elections, selectedOffice, selectedYear, selectedCounty])

  // Historical trend for selected candidate
  const [selectedCandidate, setSelCand] = useState(null)
  const candidateHistory = useMemo(() => {
    if (!selectedCandidate) return []
    return elections.filter(r => isCandidateRecord(r) && r.candidate === selectedCandidate)
      .reduce((acc, r) => {
        const key = `${r.year}||${r.office}`
        const existing = acc.find(a => a.key === key)
        if (existing) existing.votes += r.votes
        else acc.push({ key, year: r.year, office: r.office, votes: r.votes, county: selectedCounty !== 'All' ? r.county : 'Statewide' })
        return acc
      }, [])
      .sort((a, b) => a.year - b.year)
  }, [elections, selectedCandidate, selectedCounty])

  const PIE_COLORS = { Republican: '#ef4444', Democratic: '#3b82f6', Libertarian: '#a78bfa', Nonpartisan: '#64748b' }
  const METHOD_COLORS = ['#6366f1', '#3b82f6', '#10b981']

  if (!hasData) return <EmptyState />

  const noCandidateData = elections.every(r => r.office === 'BALLOT_TOTALS')

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-slate-100">Race Explorer</h2>
        <p className="text-sm text-slate-400 mt-1">Search and analyze candidate results, historical comparisons, vote method breakdowns, and trends.</p>
      </div>

      {noCandidateData && (
        <div className="card mb-6 p-4 border-amber-700/40 bg-amber-900/20">
          <p className="text-sm text-amber-300">
            No candidate-level records found in imported data. Race Explorer requires records with <code className="font-mono text-xs bg-navy-800 px-1 rounded">office</code> and <code className="font-mono text-xs bg-navy-800 px-1 rounded">candidate</code> columns.
          </p>
          <p className="text-xs text-amber-400/70 mt-1">
            Ballot-total-only records (office = BALLOT_TOTALS) are not sufficient for this view. Import candidate-level results to enable race analysis.
          </p>
        </div>
      )}

      {/* Search & filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="stat-label block mb-1">Search Candidate</label>
            <input value={searchCandidate} onChange={e => setSearchCand(e.target.value)}
              placeholder="Name…" className="filter-select w-full" />
          </div>
          <div>
            <label className="stat-label block mb-1">County</label>
            <select value={selectedCounty} onChange={e => setCounty(e.target.value)} className="filter-select w-full">
              <option value="All">All Counties</option>
              {dims.counties.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="stat-label block mb-1">Office</label>
            <select value={selectedOffice} onChange={e => setOffice(e.target.value)} className="filter-select w-full">
              <option value="All">All Offices</option>
              {dims.offices.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="stat-label block mb-1">Year</label>
            <select value={selectedYear} onChange={e => setYear(e.target.value)} className="filter-select w-full">
              <option value="All">All Years</option>
              {dims.years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="stat-label block mb-1">Ballot Type</label>
            <select value={selectedParty} onChange={e => setParty(e.target.value)} className="filter-select w-full">
              <option value="All">All Ballots</option>
              <option value="Republican">Republican Ballot</option>
              <option value="Democratic">Democratic Ballot</option>
            </select>
          </div>
        </div>
        <div className="mt-3 text-xs text-slate-500">{filtered.length.toLocaleString()} records match · top 50 candidates shown by vote total</div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: results table */}
        <div className="xl:col-span-2 space-y-4">
          {/* Race results if specific race selected */}
          {raceResults.length > 0 && (
            <div className="card">
              <div className="section-title">{selectedOffice} — {selectedYear}{selectedCounty !== 'All' ? ` · ${selectedCounty} County` : ' · Statewide'}</div>
              <div className="mb-4">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={raceResults} layout="vertical" margin={{ top: 4, right: 40, bottom: 0, left: 100 }}>
                    <CartesianGrid {...GRID} horizontal={false} />
                    <XAxis type="number" tick={AXIS} tickFormatter={v => fmt.votes(v)} />
                    <YAxis type="category" dataKey="candidate" tick={{ ...AXIS, fontSize: 10 }} width={95} />
                    <Tooltip {...TT} formatter={(v, name) => [fmt.number(v), 'Votes']} />
                    <Bar dataKey="votes" radius={[0, 3, 3, 0]}>
                      {raceResults.map((r, i) => (
                        <Cell key={i} fill={PIE_COLORS[r.party] || '#6366f1'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-navy-500">
                    <th className="text-left py-2 pr-4">Candidate</th>
                    <th className="text-left py-2 pr-4">Ballot Type</th>
                    <th className="text-right py-2 pr-4">Votes</th>
                    <th className="text-right py-2">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {raceResults.map((r, i) => (
                    <tr key={i} className="border-b border-navy-700">
                      <td className="py-2 pr-4">
                        <button onClick={() => setSelCand(r.candidate === selectedCandidate ? null : r.candidate)}
                          className="text-slate-200 font-medium hover:text-indigo-400 text-left">
                          {r.candidate}
                        </button>
                      </td>
                      <td className="py-2 pr-4" style={{ color: PIE_COLORS[r.party] || '#64748b' }}>{r.party}</td>
                      <td className="py-2 pr-4 text-right text-slate-300">{fmt.number(r.votes)}</td>
                      <td className="py-2 text-right font-medium text-slate-300">{fmt.pct(r.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Candidate summary table */}
          <div className="card">
            <div className="section-title">Candidate Results — {filtered.length === elections.length ? 'All Records' : 'Filtered'}</div>
            <div className="overflow-y-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-navy-800">
                  <tr className="text-slate-500 border-b border-navy-500">
                    <th className="text-left py-2 pr-4">Candidate</th>
                    <th className="text-left py-2 pr-4">Ballot</th>
                    <th className="text-left py-2 pr-4">Office</th>
                    <th className="text-right py-2 pr-4">Year</th>
                    <th className="text-right py-2 pr-4">Votes</th>
                    <th className="text-right py-2">Counties</th>
                  </tr>
                </thead>
                <tbody>
                  {candidateSummary.map((r, i) => (
                    <tr key={i} className={`border-b border-navy-700 hover:bg-navy-700/30 cursor-pointer ${r.candidate === selectedCandidate ? 'bg-indigo-900/20' : ''}`}
                      onClick={() => setSelCand(r.candidate === selectedCandidate ? null : r.candidate)}>
                      <td className="py-2 pr-4 text-slate-200 font-medium">{r.candidate || '—'}</td>
                      <td className="py-2 pr-4" style={{ color: r.party === 'Republican' ? '#ef4444' : r.party === 'Democratic' ? '#3b82f6' : '#a78bfa' }}>
                        {r.party}
                      </td>
                      <td className="py-2 pr-4 text-slate-400">{r.office}</td>
                      <td className="py-2 pr-4 text-right text-slate-400">{r.year}</td>
                      <td className="py-2 pr-4 text-right text-slate-300 font-medium">{fmt.number(r.totalVotes)}</td>
                      <td className="py-2 text-right text-slate-400">{r.countyCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: charts */}
        <div className="space-y-4">
          {/* Vote method breakdown */}
          {voteMethodBreakdown.length > 0 && (
            <div className="card">
              <div className="section-title">Vote Method Breakdown</div>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={voteMethodBreakdown} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" outerRadius={65} innerRadius={30}>
                    {voteMethodBreakdown.map((_, i) => (
                      <Cell key={i} fill={METHOD_COLORS[i % METHOD_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...TT} formatter={(v) => [fmt.number(v), '']} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Candidate history */}
          {selectedCandidate && candidateHistory.length > 0 && (
            <motion.div key={selectedCandidate} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card">
              <div className="section-title">{selectedCandidate} — Vote History</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={candidateHistory} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="year" tick={AXIS} />
                  <YAxis tickFormatter={v => fmt.votes(v)} tick={AXIS} />
                  <Tooltip {...TT} formatter={(v) => [fmt.number(v), 'Votes']} />
                  <Line type="monotone" dataKey="votes" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-2 text-xs text-slate-500">Click another candidate to compare.</div>
            </motion.div>
          )}

          {!selectedCandidate && (
            <div className="card text-sm text-slate-500">
              Click a candidate in the table to view their vote history and trend.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
