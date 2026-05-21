import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useElectionStore from '../../store/electionStore.js'
import { importContextualData } from '../../services/GeorgiaElectionService.js'
import { importFile, importText, importRegistrationData } from '../../pipeline/Pipeline.js'
import PipelineTab from './PipelineTab.jsx'

function SnapshotRow({ snap }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-navy-600 last:border-0 text-sm">
      <div>
        <div className="text-slate-200 font-medium">{snap.label}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          {snap.source}
          {snap.yearRange ? ` · ${snap.yearRange}` : ''}
          {snap.recordCount != null ? ` · ${snap.recordCount.toLocaleString()} records` : ''}
          {snap.officialStatus ? ` · ${snap.officialStatus}` : ''}
        </div>
      </div>
      <div className="text-xs text-slate-500 shrink-0 ml-4">
        {new Date(snap.importedAt).toLocaleString()}
      </div>
    </div>
  )
}

export default function DataImport() {
  const addRecords    = useElectionStore(s => s.addRecords)
  const addContextual = useElectionStore(s => s.addContextualData)
  const clearAllData  = useElectionStore(s => s.clearAllData)
  const snapshots     = useElectionStore(s => s.snapshots)
  const hasData       = useElectionStore(s => s.hasData)

  const [tab, setTab]          = useState('file')
  const [dragging, setDrag]    = useState(false)
  const [status, setStatus]    = useState(null)
  const [csvText, setCsvText]  = useState('')
  const [jsonText, setJsonText] = useState('')
  const [label, setLabel]      = useState('')
  const [source, setSource]    = useState('')
  const [officialStatus, setOfficialStatus] = useState('Unofficial')
  const [defaultYear, setDefaultYear]       = useState('')
  const [ctxJson, setCtxJson]  = useState('')
  const fileRef = useRef()

  // Build shared import opts from UI fields
  const importOpts = useCallback(() => ({
    source:        source || undefined,
    officialStatus,
    defaultYear:   defaultYear ? parseInt(defaultYear, 10) : undefined,
  }), [source, officialStatus, defaultYear])

  function describeResult(result, sourceName) {
    const { records, detectedColumns = [], rejected = [] } = result
    const colList = detectedColumns.length
      ? `Detected: ${detectedColumns.join(', ')}.`
      : 'No schema columns detected — check headers.'
    const rejNote = rejected.length ? ` ${rejected.length} rows rejected.` : ''
    return `Imported ${records.length.toLocaleString()} records from "${sourceName}".${rejNote} ${colList}`
  }

  function describeFailure(result, sourceName) {
    const { detectedColumns = [] } = result
    // Only votes is strictly required; county/precinct are both optional (precinct sheets lack county)
    const missing = ['votes'].filter(f => !detectedColumns.includes(f))
    const colInfo = detectedColumns.length
      ? `Detected columns: ${detectedColumns.join(', ')}.`
      : 'No recognisable columns found.'
    const missingInfo = missing.length ? ` Required but missing: ${missing.join(', ')}.` : ''
    return `No valid records in "${sourceName}". ${colInfo}${missingInfo} Check headers match the format guide.`
  }

  const handleFiles = useCallback(async (files) => {
    const file = files[0]
    if (!file) return
    setStatus({ type: 'loading', msg: `Parsing ${file.name}…` })
    try {
      const opts = importOpts()
      const result = await importFile(file, {
        ...opts,
        source:     opts.source || `File: ${file.name}`,
        sourceFile: file.name,
      })
      if (!result.records.length) {
        throw new Error(describeFailure(result, file.name))
      }
      addRecords(result.records, {
        label: label || file.name,
        source: opts.source || `File: ${file.name}`,
        officialStatus,
      })
      setStatus({ type: 'ok', msg: describeResult(result, file.name) })
    } catch (e) {
      setStatus({ type: 'error', msg: `Import failed: ${e.message}` })
    }
  }, [addRecords, label, importOpts, officialStatus])

  const onDrop = useCallback(e => {
    e.preventDefault(); setDrag(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleCSVPaste = async () => {
    if (!csvText.trim()) return
    setStatus({ type: 'loading', msg: 'Parsing CSV…' })
    try {
      const opts = importOpts()
      const result = await importText(csvText, 'csv', {
        ...opts,
        source: opts.source || 'Pasted CSV',
      })
      if (!result.records.length) throw new Error(describeFailure(result, 'pasted CSV'))
      addRecords(result.records, { label: label || 'CSV Paste', source: opts.source || 'Pasted CSV', officialStatus })
      setStatus({ type: 'ok', msg: describeResult(result, 'pasted CSV') })
      setCsvText('')
    } catch (e) {
      setStatus({ type: 'error', msg: `Parse error: ${e.message}` })
    }
  }

  const handleJSONPaste = async () => {
    if (!jsonText.trim()) return
    setStatus({ type: 'loading', msg: 'Parsing JSON…' })
    try {
      const opts = importOpts()
      const result = await importText(jsonText, 'json', {
        ...opts,
        source: opts.source || 'Pasted JSON',
      })
      if (!result.records.length) throw new Error(describeFailure(result, 'pasted JSON'))
      addRecords(result.records, { label: label || 'JSON Import', source: opts.source || 'Pasted JSON', officialStatus })
      setStatus({ type: 'ok', msg: describeResult(result, 'pasted JSON') })
      setJsonText('')
    } catch (e) {
      setStatus({ type: 'error', msg: `Parse error: ${e.message}` })
    }
  }

  const handleContextualImport = () => {
    if (!ctxJson.trim()) return
    try {
      const raw = JSON.parse(ctxJson)
      const ctx = importContextualData(Array.isArray(raw) ? raw : [raw])
      addContextual(ctx)
      setStatus({ type: 'ok', msg: `Contextual data loaded for ${Object.keys(ctx).length} county/year entries. Used only as turnout denominator.` })
      setCtxJson('')
    } catch (e) {
      setStatus({ type: 'error', msg: `Parse error: ${e.message}` })
    }
  }

  const confirmClear = () => {
    if (window.confirm(
      'This will permanently remove all imported data from this session.\n\n' +
      'No sample data will be loaded in its place — the dashboard will return to an empty state.\n\n' +
      'Proceed?'
    )) {
      clearAllData()
      setStatus({ type: 'ok', msg: 'All imported data cleared. Import new data to resume analysis.' })
    }
  }

  const TABS = [
    { id: 'pipeline',   label: '⚡ Pipeline' },
    { id: 'file',       label: 'File Upload' },
    { id: 'csv',        label: 'Paste CSV' },
    { id: 'json',       label: 'Paste JSON' },
    { id: 'contextual', label: 'Voter / Census Context' },
    { id: 'history',    label: `Import History (${snapshots.length})` },
  ]

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-100">Import Data</h2>
        <p className="text-sm text-slate-400 mt-1">
          Import Georgia Secretary of State election files, county exports, or voter registration data.
          All imports are additive — historical records are never removed or overwritten.
          No data is estimated or generated when fields are absent.
        </p>
      </div>

      {tab === 'pipeline' ? (
        <PipelineTab onImportSuccess={() => setStatus({ type: 'ok', msg: 'Pipeline import complete.' })} />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Import panel */}
        <div className="lg:col-span-2 card">
          {/* Tabs */}
          <div className="flex gap-1 flex-wrap mb-5">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`tab-btn text-xs py-1.5 ${tab === t.id ? 'tab-btn-active' : 'tab-btn-inactive'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Import metadata */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div>
              <label className="stat-label block mb-1">Import Label</label>
              <input value={label} onChange={e => setLabel(e.target.value)}
                placeholder="e.g. 2024 SOS May Primary"
                className="w-full bg-navy-700 border border-navy-500 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="stat-label block mb-1">Source</label>
              <input value={source} onChange={e => setSource(e.target.value)}
                placeholder="e.g. Georgia SOS Official"
                className="w-full bg-navy-700 border border-navy-500 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="stat-label block mb-1">
                Default Year
                <span className="text-slate-600 font-normal ml-1">(if file lacks year column)</span>
              </label>
              <input value={defaultYear} onChange={e => setDefaultYear(e.target.value)}
                placeholder="e.g. 2024"
                maxLength={4}
                className="w-full bg-navy-700 border border-navy-500 rounded-lg px-3 py-1.5 text-sm text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="stat-label block mb-1">Official Status</label>
              <select value={officialStatus} onChange={e => setOfficialStatus(e.target.value)} className="filter-select w-full">
                <option value="Official">Official</option>
                <option value="Unofficial">Unofficial</option>
                <option value="Historical">Historical</option>
                <option value="Snapshot">Snapshot</option>
              </select>
            </div>
          </div>

          {/* Tab content */}
          <AnimatePresence mode="wait">
            {tab === 'file' && (
              <motion.div key="file" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div
                  onDragOver={e => { e.preventDefault(); setDrag(true) }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                    dragging ? 'border-indigo-400 bg-indigo-900/20' : 'border-navy-400 hover:border-navy-300 hover:bg-navy-700/20'
                  }`}
                >
                  <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-slate-300 font-medium">Drop file here or click to browse</p>
                  <p className="text-slate-500 text-sm mt-1">Accepts CSV · JSON · Excel (.xlsx/.xls)</p>
                  <input ref={fileRef} type="file" accept=".csv,.json,.txt,.xlsx,.xls" className="hidden"
                    onChange={e => handleFiles(e.target.files)} />
                </div>
              </motion.div>
            )}

            {tab === 'csv' && (
              <motion.div key="csv" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <textarea value={csvText} onChange={e => setCsvText(e.target.value)}
                  rows={10}
                  placeholder={`county,year,office,candidate,party,votes,election_day_votes,early_votes,absentee_votes\nFulton,2024,President,Donald Trump,Republican,38420,12100,18900,7420\nFulton,2024,President,Joe Biden,Democratic,54291,16800,28400,9091`}
                  className="w-full bg-navy-700 border border-navy-500 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none" />
                <p className="text-xs text-slate-500 mt-2 mb-3">
                  Header row required. Column names are auto-detected; see the format guide on the right for accepted aliases.
                </p>
                <button onClick={handleCSVPaste}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
                  Parse & Import CSV
                </button>
              </motion.div>
            )}

            {tab === 'json' && (
              <motion.div key="json" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <textarea value={jsonText} onChange={e => setJsonText(e.target.value)}
                  rows={10}
                  placeholder={`[{"county":"Fulton","year":2024,"office":"President","candidate":"Donald Trump","party":"Republican","votes":38420}]`}
                  className="w-full bg-navy-700 border border-navy-500 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none" />
                <p className="text-xs text-slate-500 mt-2 mb-3">Array of record objects. Field names are auto-detected.</p>
                <button onClick={handleJSONPaste}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
                  Parse & Import JSON
                </button>
              </motion.div>
            )}

            {tab === 'contextual' && (
              <motion.div key="ctx" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="p-3 bg-indigo-900/20 border border-indigo-700/30 rounded-lg mb-3 text-xs text-indigo-200">
                  <strong>Important:</strong> Voter registration data is used <em>only as a turnout denominator</em>
                  (total ballots / registered voters = turnout rate). Georgia has no party registration.
                  This data is never treated as Republican or Democratic registration.
                </div>
                <textarea value={ctxJson} onChange={e => setCtxJson(e.target.value)}
                  rows={8}
                  placeholder={`[{"county":"Fulton","year":2024,"totalRegistered":896000,"activeVoters":812000,"inactiveVoters":84000,"population":1065343}]`}
                  className="w-full bg-navy-700 border border-navy-500 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none" />
                <p className="text-xs text-slate-500 mt-2 mb-3">
                  Accepted fields: county, year, totalRegistered, activeVoters, inactiveVoters, population.
                  Source these from the Georgia SOS voter registration statistics page or U.S. Census ACS.
                </p>
                <button onClick={handleContextualImport}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
                  Import Contextual Data
                </button>
              </motion.div>
            )}

            {tab === 'history' && (
              <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {snapshots.length === 0 ? (
                  <p className="text-slate-500 text-sm py-4">No imports recorded in this session.</p>
                ) : (
                  [...snapshots].reverse().map(snap => <SnapshotRow key={snap.id} snap={snap} />)
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Status bar */}
          <AnimatePresence>
            {status && (
              <motion.div
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`mt-4 p-3 rounded-lg text-sm flex items-start gap-3 ${
                  status.type === 'ok'      ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/40' :
                  status.type === 'error'   ? 'bg-red-900/40 text-red-300 border border-red-700/40' :
                                              'bg-indigo-900/40 text-indigo-300 border border-indigo-700/40'
                }`}
              >
                <span className="flex-1">{status.msg}</span>
                {status.type !== 'loading' && (
                  <button onClick={() => setStatus(null)} className="opacity-60 hover:opacity-100 shrink-0">✕</button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <div className="card">
            <div className="section-title">Column Format Guide</div>
            <p className="text-xs text-slate-500 mb-3">
              Headers are auto-detected. Clarity Elections and SOS export names are mapped automatically.
            </p>
            <div className="space-y-1.5 text-xs font-mono">
              {[
                // [display, note, required, optional]
                ['Total / Total Votes',          'votes',              true,  false],
                ['County / County Name',         'county',             false, true],
                ['Office Name / Contest Name',   'office',             false, false],
                ['Ballot Name / Choice',         'candidate',          false, false],
                ['Party',                        'REP · DEM · LIB',   false, false],
                ['Group',                        'vote method',        false, false],
                ['Election Day Votes',           '',                   false, false],
                ['Advance Voting Votes',         '',                   false, false],
                ['Absentee by Mail Votes',       '',                   false, false],
                ['Provisional Votes',            '',                   false, false],
                ['Precinct / Precinct Name',     '',                   false, false],
                ['year / election_type',         '',                   false, false],
                ['registered_voters',            'turnout denominator',false, false],
              ].map(([col, note, required, optional]) => (
                <div key={col} className="flex gap-2 items-baseline">
                  <span className={required ? 'text-emerald-400 shrink-0' : optional ? 'text-amber-500 shrink-0' : 'text-indigo-400 shrink-0'}>{col}</span>
                  {required && <span className="text-emerald-700 text-[10px]">required</span>}
                  {optional && <span className="text-amber-700 text-[10px]">optional</span>}
                  {note && <span className="text-slate-600">← {note}</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="section-title">Data Integrity Guarantees</div>
            <ul className="text-xs text-slate-400 space-y-2">
              <li className="flex gap-2"><span className="text-emerald-400 shrink-0">✓</span> All imports are additive — nothing is ever removed or overwritten</li>
              <li className="flex gap-2"><span className="text-emerald-400 shrink-0">✓</span> Each import is timestamped and logged in import history</li>
              <li className="flex gap-2"><span className="text-emerald-400 shrink-0">✓</span> Missing fields appear as "—", never estimated</li>
              <li className="flex gap-2"><span className="text-emerald-400 shrink-0">✓</span> Anomaly analysis runs only on imported data</li>
              <li className="flex gap-2"><span className="text-emerald-400 shrink-0">✓</span> Data cached in browser localStorage between sessions</li>
              <li className="flex gap-2"><span className="text-emerald-400 shrink-0">✓</span> No synthetic or estimated records are ever generated</li>
            </ul>
          </div>

          {/* Clear data — destructive, clearly labeled */}
          {hasData && (
            <div className="card border-red-900/40">
              <div className="section-title text-red-400">Clear All Data</div>
              <p className="text-xs text-slate-500 mb-3">
                Permanently removes all imported records from this session.
                The dashboard will return to an empty state — no sample data will replace it.
              </p>
              <button
                onClick={confirmClear}
                className="w-full px-4 py-2 border border-red-700/50 hover:border-red-500 text-red-400 hover:text-red-300 text-sm rounded-lg transition-colors"
              >
                Clear All Imported Data
              </button>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  )
}
