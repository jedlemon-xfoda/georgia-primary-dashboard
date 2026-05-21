import { useState, useMemo, Fragment } from 'react'
import useElectionStore from '../../store/electionStore.js'
import EmptyState from '../EmptyState.jsx'
import { fmt } from '../../utils/formatters.js'
import { isCandidateRecord } from '../../utils/candidateFilter.js'
import { auditPartyUniverses, GEORGIA_NONPARTISAN_NOTE } from '../../utils/partyClassifier.js'

function normalizeOfficeName(office) {
  if (!office) return office
  return office
    .replace(/\s*[-–—]\s*(republican|democratic|democrat|nonpartisan|libertarian|gop|rep|dem)\s*(primary|ballot|party|ticket)?\s*$/i, '')
    .replace(/\s*\((r|d|rep|dem|republican|democratic)\)\s*$/i, '')
    .trim()
}

function classifyScope(office) {
  if (!office) return 'other'
  const lc = office.toLowerCase()
  if (/\bclerk\s+of\b/i.test(office)) return 'other'
  if (/(judge|justice|court|appeal|magistrate|probate|superior|juvenile|state court|supreme)/i.test(office)) return 'judicial'
  if (lc.includes('governor') || lc.includes('lieutenant governor') || lc.includes('attorney general') ||
      lc.includes('secretary of state') || lc.includes('treasurer') || lc.includes('superintendent') ||
      lc.includes('commissioner of agriculture') || lc.includes('agriculture commissioner') ||
      lc.includes('insurance commissioner') || lc.includes('commissioner of insurance') ||
      lc.includes('labor commissioner') || lc.includes('commissioner of labor') ||
      lc.includes('u.s. senate') || lc.includes('us senate') || lc.includes('united states senate') ||
      lc.includes('public service commission') || lc.includes('public service commissioner'))
    return 'statewide'
  return 'other'
}

// Builds the full ballot sequence for one partisan ballot:
//   1. Partisan races (partyFilter only), sorted descending by votes
//   2. Nonpartisan/judicial races (not R, not D), sorted descending by votes
// Mirrors actual ballot traversal: partisan section → party questions (excluded) → nonpartisan section.
function buildBallotSequence(recs, partyFilter) {
  const partisanMap    = new Map()
  const nonpartisanMap = new Map()
  for (const r of recs) {
    const key = normalizeOfficeName(r.office)
    if (r.candidateParty === partyFilter) {
      partisanMap.set(key, (partisanMap.get(key) || 0) + (r.votes || 0))
    } else if (r.candidateParty !== 'Republican' && r.candidateParty !== 'Democratic') {
      nonpartisanMap.set(key, (nonpartisanMap.get(key) || 0) + (r.votes || 0))
    }
  }
  const partisan = [...partisanMap.entries()]
    .filter(([, total]) => total > 0)
    .map(([office, total]) => ({ office, total, section: 'partisan' }))
    .sort((a, b) => b.total - a.total)
  const nonpartisan = [...nonpartisanMap.entries()]
    .filter(([, total]) => total > 0)
    .map(([office, total]) => ({ office, total, section: 'nonpartisan' }))
    .sort((a, b) => b.total - a.total)
  return [...partisan, ...nonpartisan]
}

function RolloffPanel({ label, color, offices }) {
  if (offices.length < 2) {
    return (
      <div className="bg-navy-800/60 rounded-lg p-4">
        <div className="stat-label mb-2" style={{ color }}>{label}</div>
        <p className="text-xs text-slate-500">Fewer than 2 contests found.</p>
      </div>
    )
  }
  const top            = offices[0]
  const bottom         = offices[offices.length - 1]
  const pct            = ((top.total - bottom.total) / top.total) * 100
  const hasNonpartisan = offices.some(o => o.section === 'nonpartisan')

  return (
    <div className="space-y-3">
      <div className="stat-label" style={{ color }}>{label}</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-navy-800/60 rounded-lg p-4">
          <div className="stat-label mb-1">Top Race</div>
          <div className="text-slate-200 font-medium text-sm">{top.office}</div>
          <div className="text-2xl font-bold text-slate-100 mt-1">{fmt.number(top.total)}</div>
          <div className="text-xs text-slate-500 mt-0.5">votes</div>
        </div>
        <div className="bg-navy-800/60 rounded-lg p-4">
          <div className="stat-label mb-1">
            Bottom Race
            {bottom.section === 'nonpartisan' && (
              <span className="ml-2 text-amber-500/70 font-normal text-xs">· Nonpartisan</span>
            )}
          </div>
          <div className="text-slate-200 font-medium text-sm">{bottom.office}</div>
          <div className="text-2xl font-bold text-slate-100 mt-1">{fmt.number(bottom.total)}</div>
          <div className="text-xs text-slate-500 mt-0.5">votes</div>
        </div>
      </div>

      <div className="bg-navy-800/60 rounded-lg p-4">
        <div className="stat-label mb-2">Calculated Roll-Off</div>
        <div className="text-3xl font-bold text-indigo-400">{pct.toFixed(2)}%</div>
        <div className="mt-2 font-mono text-xs text-slate-500 bg-navy-900/60 rounded px-3 py-2 inline-block">
          ({fmt.number(top.total)} − {fmt.number(bottom.total)}) / {fmt.number(top.total)} = {pct.toFixed(4)}
        </div>
        {hasNonpartisan && (
          <p className="text-xs text-amber-600/60 mt-2">
            Includes nonpartisan/judicial section — roll-off measured continuously from top partisan baseline.
          </p>
        )}
      </div>

      <div>
        <div className="text-xs text-slate-500 mb-2">Full ballot sequence — {offices.length} contests</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-navy-500">
                <th className="text-left py-2 pr-4">Office</th>
                <th className="text-right py-2 pr-4">Votes</th>
                <th className="text-right py-2">Roll-Off from Top</th>
              </tr>
            </thead>
            <tbody>
              {offices.map((r, i) => {
                const prev       = i > 0 ? offices[i - 1] : null
                const showSep    = r.section === 'nonpartisan' && (!prev || prev.section === 'partisan')
                const rowPct     = top.total > 0 ? ((top.total - r.total) / top.total) * 100 : 0
                const rowColor   = i === 0 ? 'text-slate-200' : r.section === 'nonpartisan' ? 'text-amber-300/70' : 'text-slate-400'
                return (
                  <Fragment key={r.office}>
                    {showSep && (
                      <tr>
                        <td colSpan={3} className="py-1.5 px-2 text-xs text-amber-500/80 border-t border-amber-800/40 bg-amber-900/10">
                          ↓ Nonpartisan General Election
                        </td>
                      </tr>
                    )}
                    <tr className={`border-b border-navy-700 ${rowColor}`}>
                      <td className="py-2 pr-4">{r.office}</td>
                      <td className="py-2 pr-4 text-right font-mono">{fmt.number(r.total)}</td>
                      <td className="py-2 text-right font-mono">{i === 0 ? '—' : `${rowPct.toFixed(2)}%`}</td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function DataValidationTab() {
  const hasData   = useElectionStore(s => s.hasData)
  const elections = useElectionStore(s => s.elections)
  const dims      = useElectionStore(s => s.dims)

  const [selectedCounty, setCounty] = useState('All')
  const [selectedYear,   setYear]   = useState('')
  const [ballot,         setBallot] = useState('Both')
  const [notes,          setNotes]  = useState('')

  const targetYear = selectedYear ? Number(selectedYear) : (dims.years[dims.years.length - 1] ?? null)

  const recs = useMemo(() => {
    if (!targetYear) return []
    return elections.filter(r => {
      if (r.year !== targetYear) return false
      if (selectedCounty !== 'All' && r.county !== selectedCounty) return false
      if (!isCandidateRecord(r)) return false
      if (r.candidateParty === 'MISSING_DATA') return (r.votes || 0) > 0
      return true
    })
  }, [elections, targetYear, selectedCounty])

  // Full ballot sequences — partisan races followed by nonpartisan section, never mixed across parties
  const ballotSeqR = useMemo(() => buildBallotSequence(recs, 'Republican'), [recs])
  const ballotSeqD = useMemo(() => buildBallotSequence(recs, 'Democratic'), [recs])

  // Party-universe audit — scoped to records that feed the current view only.
  // Blank-party records go to the nonpartisan (N) pool; they never enter R or D
  // calculations, so they only affect the audit when Both Ballots is selected.
  const partyAudit = useMemo(() => {
    let auditRecs = recs
    if (ballot === 'R') auditRecs = recs.filter(r => r.candidateParty === 'Republican')
    if (ballot === 'D') auditRecs = recs.filter(r => r.candidateParty === 'Democratic')
    return auditPartyUniverses(auditRecs, { sourceNote: GEORGIA_NONPARTISAN_NOTE })
  }, [recs, ballot])

  if (!hasData) return <EmptyState />

  const showR = ballot === 'Both' || ballot === 'R'
  const showD = ballot === 'Both' || ballot === 'D'

  return (
    <div className="max-w-screen-lg mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-100">Data Validation</h2>
        <p className="text-sm text-slate-400 mt-1">
          Spot-check dashboard results against your source files. Roll-off is computed separately per ballot — Republican contests are never compared against Democratic contests.
        </p>
      </div>

      {/* Data-quality flag — visible when blank-party records are present */}
      {partyAudit.counts.inferred > 0 && (
        <div className="card mb-4 border-amber-700/40 bg-amber-900/10 p-4">
          <div className="flex items-start gap-2">
            <span className="text-amber-400 font-bold text-sm mt-0.5">⚠</span>
            <div>
              <p className="text-sm font-semibold text-amber-300">
                Ballot Universe Interpretation Applied
              </p>
              <p className="text-xs text-amber-400/80 mt-1">
                {partyAudit.counts.inferred.toLocaleString()} record{partyAudit.counts.inferred !== 1 ? 's' : ''} in this selection have a blank or missing party field.
                These are classified as <strong>Nonpartisan</strong> based on the following assumption:
              </p>
              {partyAudit.bases.map((b, i) => (
                <p key={i} className="text-xs text-amber-500/70 mt-1 font-mono pl-2 border-l border-amber-700">
                  {b}
                </p>
              ))}
              <p className="text-xs text-amber-600/60 mt-2">
                This assumption may not apply to other states or election types. Review source files to confirm.
                {partyAudit.counts.low > 0 && (
                  <span className="ml-1 text-red-400/70">
                    {partyAudit.counts.low.toLocaleString()} additional record{partyAudit.counts.low !== 1 ? 's' : ''} could not be classified and are marked Unknown.
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {partyAudit.counts.low > 0 && partyAudit.counts.inferred === 0 && (
        <div className="card mb-4 border-red-700/40 bg-red-900/10 p-4">
          <div className="flex items-start gap-2">
            <span className="text-red-400 font-bold text-sm mt-0.5">✕</span>
            <div>
              <p className="text-sm font-semibold text-red-300">Unknown Ballot Universe</p>
              <p className="text-xs text-red-400/80 mt-1">
                {partyAudit.counts.low.toLocaleString()} record{partyAudit.counts.low !== 1 ? 's' : ''} have a blank party field with no corroborating context to determine ballot universe. These are excluded from roll-off calculations. Review source files manually.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="stat-label block mb-1">Year</label>
            <select value={selectedYear || targetYear} onChange={e => setYear(e.target.value)} className="filter-select">
              {dims.years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="stat-label block mb-1">County</label>
            <select value={selectedCounty} onChange={e => setCounty(e.target.value)} className="filter-select">
              <option value="All">All Counties (Statewide)</option>
              {dims.counties.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="stat-label block mb-1">Ballot Type</label>
            <select value={ballot} onChange={e => setBallot(e.target.value)} className="filter-select">
              <option value="Both">Both Ballots</option>
              <option value="R">Republican Ballot</option>
              <option value="D">Democratic Ballot</option>
            </select>
          </div>
        </div>
      </div>

      {/* Rolloff validation */}
      <div className="card mb-6">
        <div className="section-title mb-4">
          Roll-Off Validation — {targetYear}{selectedCounty !== 'All' ? ` · ${selectedCounty} County` : ' · Statewide'}
        </div>
        <div className={ballot === 'Both' ? 'space-y-8' : ''}>
          {showR && <RolloffPanel label="Republican Ballot" color="#ef4444" offices={ballotSeqR} />}
          {ballot === 'Both' && ballotSeqR.length >= 2 && ballotSeqD.length >= 2 && (
            <hr className="border-navy-600" />
          )}
          {showD && <RolloffPanel label="Democratic Ballot" color="#3b82f6" offices={ballotSeqD} />}
        </div>
      </div>

      {/* Manual notes */}
      <div className="card">
        <div className="section-title mb-3">Manual Source Verification Notes</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Paste source file values here for manual comparison. These notes are not saved."
          rows={6}
          className="w-full bg-navy-900/60 border border-navy-500 rounded-lg px-3 py-2 text-sm text-slate-300 placeholder-slate-600 resize-y focus:outline-none focus:border-indigo-500"
        />
        <p className="text-xs text-slate-600 mt-1">Notes are session-only and not persisted.</p>
      </div>
    </div>
  )
}
