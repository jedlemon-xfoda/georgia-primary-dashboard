// PipelineTab — verified source catalog, Census fetch, SOS download guide, audit log
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CENSUS_DATASETS } from '../../pipeline/sources/CensusClient.js'
import { SOURCE_REGISTRY, ACCESS } from '../../pipeline/sources/SourceRegistry.js'
import { SOS_PORTAL, SOS_DATA_HUB, SOS_VOTER_REG } from '../../pipeline/sources/SourceRegistry.js'
import { loadPipelineManifest, loadFromManifestEntry, fetchCensusPopulation, AuditLog } from '../../pipeline/Pipeline.js'
import useElectionStore from '../../store/electionStore.js'

// ─── Sub-components ───────────────────────────────────────────────────────────

function AccessBadge({ access }) {
  const cfg = {
    automated: { label: 'Automated',  cls: 'text-emerald-400 bg-emerald-900/20 border-emerald-700/40' },
    manual:    { label: 'Manual DL',  cls: 'text-amber-400 bg-amber-900/20 border-amber-700/40' },
    blocked:   { label: 'Blocked',    cls: 'text-red-400 bg-red-900/20 border-red-700/40' },
    unknown:   { label: 'Unknown',    cls: 'text-slate-400 bg-slate-800/40 border-slate-600/40' },
  }
  const { label, cls } = cfg[access] || cfg.unknown
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  )
}

function AuditEntry({ entry }) {
  const [expanded, setExpanded] = useState(false)
  const statusCls = entry.status === 'success' ? 'text-emerald-400'
                  : entry.status === 'partial'  ? 'text-amber-400' : 'text-red-400'
  return (
    <div className="border border-navy-600 rounded-lg mb-2 overflow-hidden">
      <button
        className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-navy-700/30"
        onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3 min-w-0">
          <span className={`text-xs font-semibold uppercase shrink-0 ${statusCls}`}>{entry.status}</span>
          <span className="text-xs text-slate-300 truncate">{entry.source}</span>
          {entry.sourceFile && (
            <span className="text-xs text-slate-500 truncate hidden sm:block">{entry.sourceFile}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 text-xs text-slate-500">
          <span className="text-slate-400">{entry.newRecords?.toLocaleString()} records</span>
          <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
          <span>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden">
            <div className="px-3 pb-3 pt-1 border-t border-navy-700 text-xs space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  ['Action',    entry.action],
                  ['Records',   entry.recordCount?.toLocaleString()],
                  ['New',       entry.newRecords?.toLocaleString()],
                  ['Rejected',  entry.rejected?.toLocaleString() || '0'],
                  ['Counties',  entry.counties || '—'],
                  ['Years',     entry.electionYears?.join(', ') || '—'],
                  ['Timestamp', new Date(entry.timestamp).toLocaleString()],
                  ['Audit ID',  entry.id],
                ].map(([label, val]) => (
                  <div key={label}>
                    <div className="text-slate-500">{label}</div>
                    <div className="text-slate-300 font-mono text-[11px]">{val}</div>
                  </div>
                ))}
              </div>
              {entry.sourceUrl && (
                <div>
                  <div className="text-slate-500">Source URL</div>
                  <div className="text-indigo-400 text-[11px] break-all">{entry.sourceUrl}</div>
                </div>
              )}
              {entry.error && (
                <div className="p-2 bg-red-900/20 rounded text-red-300">Error: {entry.error}</div>
              )}
              {entry.validationErrors?.length > 0 && (
                <div>
                  <div className="text-slate-500 mb-1">Validation Errors ({entry.validationErrors.length})</div>
                  {entry.validationErrors.map((e, i) => (
                    <div key={i} className="text-slate-400 flex gap-2">
                      <span className="text-slate-600">·</span>
                      <span><strong>{e.field}</strong>: {e.reason} ×{e.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function DownloadSteps({ steps }) {
  return (
    <ol className="space-y-1 mt-2">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-2 text-xs text-slate-400">
          <span className="text-slate-600 shrink-0 font-mono">{i + 1}.</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PipelineTab({ onImportSuccess }) {
  const addRecords    = useElectionStore(s => s.addRecords)
  const addContextual = useElectionStore(s => s.addContextualData)

  const [manifest,     setManifest]     = useState(null)
  const [manifStatus,  setManifStatus]  = useState('loading')
  const [censusStatus, setCensusStatus] = useState({})
  const [loadingEntry, setLoadingEntry] = useState(null)
  const [status,       setStatus]       = useState(null)
  const [auditEntries, setAuditEntries] = useState([])
  const [showAudit,    setShowAudit]    = useState(false)
  const [showRegistry, setShowRegistry] = useState(false)
  const [censusKey,    setCensusKey]    = useState('')
  const [selectedCensus, setSelectedCensus] = useState(['dec-2020', 'acs5-2022'])

  useEffect(() => {
    loadPipelineManifest().then(m => {
      setManifest(m)
      setManifStatus(m ? (m.elections?.length > 0 ? 'loaded' : 'empty') : 'unavailable')
    })
    setAuditEntries(AuditLog.getEntries())
  }, [])

  const refreshAudit = () => setAuditEntries(AuditLog.getEntries())

  const handleLoadManifestEntry = useCallback(async (entry) => {
    setLoadingEntry(entry.id)
    setStatus({ type: 'loading', msg: `Loading ${entry.label}…` })
    try {
      const result = await loadFromManifestEntry(entry)
      if (!result.records.length) throw new Error('No usable records found in file')
      addRecords(result.records, {
        label: entry.label,
        source: entry.source,
        officialStatus: entry.status || 'Official',
      })
      setStatus({ type: 'ok', msg: `Loaded ${result.records.length.toLocaleString()} records from "${entry.label}".` })
      refreshAudit()
      onImportSuccess?.()
    } catch (e) {
      setStatus({ type: 'error', msg: `Load failed: ${e.message}` })
    } finally {
      setLoadingEntry(null)
    }
  }, [addRecords, onImportSuccess])

  const handleFetchCensus = useCallback(async () => {
    if (!selectedCensus.length) return
    setCensusStatus({ loading: true })
    setStatus({ type: 'loading', msg: 'Fetching Census population data from api.census.gov…' })
    try {
      const result = await fetchCensusPopulation(selectedCensus, censusKey || undefined)
      if (result.errors.length > 0 && result.records.length === 0) {
        throw new Error(result.errors.map(e => `${e.datasetId}: ${e.error}`).join('; '))
      }
      addContextual(result.contextualData)
      setCensusStatus({ success: true, records: result.records.length })
      const errNote = result.errors.length > 0 ? ` (${result.errors.length} dataset(s) failed)` : ''
      setStatus({
        type: 'ok',
        msg: `Imported ${result.records.length} Census population records across ${selectedCensus.length} dataset(s).${errNote}`,
      })
      refreshAudit()
    } catch (e) {
      setCensusStatus({ error: e.message })
      setStatus({ type: 'error', msg: `Census fetch failed: ${e.message}` })
    }
  }, [selectedCensus, censusKey, addContextual])

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <AnimatePresence>
        {status && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`p-3 rounded-lg text-sm flex items-start gap-3 ${
              status.type === 'ok'    ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/40'
            : status.type === 'error' ? 'bg-red-900/40 text-red-300 border border-red-700/40'
            :                           'bg-indigo-900/40 text-indigo-300 border border-indigo-700/40'
            }`}>
            <span className="flex-1">{status.msg}</span>
            {status.type !== 'loading' && (
              <button onClick={() => setStatus(null)} className="opacity-60 hover:opacity-100 shrink-0">✕</button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Discovery summary */}
      <div className="card border-indigo-900/40">
        <div className="section-title mb-2">Data Source Status</div>
        <p className="text-xs text-slate-500 mb-3">
          Verified 2025-05-20. Automated access requires no browser; Manual requires a human to download and upload.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-emerald-900/10 border border-emerald-700/30 rounded-lg">
            <div className="text-xs font-semibold text-emerald-400 mb-1">Automated</div>
            <div className="text-xs text-slate-400 space-y-0.5">
              <div>U.S. Census Bureau API</div>
              <div>Manual file upload (CSV/Excel/JSON)</div>
            </div>
          </div>
          <div className="p-3 bg-amber-900/10 border border-amber-700/30 rounded-lg">
            <div className="text-xs font-semibold text-amber-400 mb-1">Manual Download Required</div>
            <div className="text-xs text-slate-400 space-y-0.5">
              <div>Georgia SOS Results Portal</div>
              <div>SOS Election Data Hub</div>
              <div>SOS Voter Registration Stats</div>
            </div>
          </div>
          <div className="p-3 bg-red-900/10 border border-red-700/30 rounded-lg">
            <div className="text-xs font-semibold text-red-400 mb-1">Blocked (HTTP 403)</div>
            <div className="text-xs text-slate-400 space-y-0.5">
              <div>Clarity Elections API</div>
              <div className="text-slate-600 text-[11px]">
                results.enr.clarityelections.com — Cloudflare Bot Management
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pre-fetched election data from manifest */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="section-title">Pre-Fetched Election Data</div>
          <button
            onClick={() => loadPipelineManifest().then(m => {
              setManifest(m)
              setManifStatus(m?.elections?.length > 0 ? 'loaded' : 'empty')
            })}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            ↻ Refresh
          </button>
        </div>

        {manifStatus === 'loading' && <p className="text-sm text-slate-500">Loading manifest…</p>}
        {manifStatus === 'unavailable' && (
          <div className="p-3 bg-navy-700/40 border border-navy-500 rounded-lg text-sm text-slate-400">
            No pre-fetched data found at <code className="font-mono text-xs text-indigo-300">public/data/pipeline-manifest.json</code>.
            Import data using the Georgia SOS download guide below, or run <code className="font-mono text-xs text-indigo-300">node scripts/fetch-census.mjs</code> for Census data.
          </div>
        )}
        {manifStatus === 'empty' && (
          <div className="p-3 bg-navy-700/40 border border-navy-500 rounded-lg text-sm text-slate-400">
            Manifest found but contains no elections yet.
          </div>
        )}
        {manifest?.elections?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 mb-3">
              Last updated: {manifest.lastUpdated ? new Date(manifest.lastUpdated).toLocaleString() : '—'}
              {' '}· {manifest.elections.length} elections available
            </p>
            {manifest.elections.map(entry => (
              <div key={entry.id}
                className="flex items-center justify-between gap-3 p-3 bg-navy-700/40 border border-navy-600 rounded-lg">
                <div className="min-w-0">
                  <div className="text-sm text-slate-200 font-medium truncate">{entry.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {entry.source} · {entry.recordCount?.toLocaleString()} records · {entry.status}
                  </div>
                </div>
                <button
                  onClick={() => handleLoadManifestEntry(entry)}
                  disabled={loadingEntry === entry.id}
                  className="shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
                  {loadingEntry === entry.id ? 'Loading…' : 'Load'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Georgia SOS download guide */}
      <div className="card">
        <div className="section-title mb-1">Georgia SOS Election Results — Manual Download</div>
        <p className="text-xs text-slate-500 mb-4">
          The SOS results portal requires a browser session. Download the file, then upload it in the
          <strong className="text-slate-300"> Upload tab</strong>. The normalizer handles standard SOS export formats automatically.
        </p>

        <div className="space-y-4">
          {/* Current results portal */}
          <div className="p-3 bg-navy-700/30 border border-navy-600 rounded-lg">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="text-sm font-semibold text-slate-200">{SOS_PORTAL.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{SOS_PORTAL.baseUrl}</div>
              </div>
              <AccessBadge access={SOS_PORTAL.access} />
            </div>
            <p className="text-xs text-slate-400 mb-2">{SOS_PORTAL.description}</p>
            <DownloadSteps steps={SOS_PORTAL.downloadSteps} />
            <div className="mt-3">
              <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wide">Known election pages</div>
              {SOS_PORTAL.knownElections.map(e => (
                <div key={e.label} className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-xs text-slate-400 shrink-0">{e.label}</span>
                  {e.url.length > 50 ? (
                    <a href={e.url} target="_blank" rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 text-[11px] font-mono truncate">
                      {e.url} ↗
                    </a>
                  ) : (
                    <span className="text-slate-600 text-[11px] italic">URL not yet verified — search results.sos.ga.gov</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Data Hub */}
          <div className="p-3 bg-navy-700/30 border border-navy-600 rounded-lg">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="text-sm font-semibold text-slate-200">{SOS_DATA_HUB.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{SOS_DATA_HUB.baseUrl}</div>
              </div>
              <AccessBadge access={SOS_DATA_HUB.access} />
            </div>
            <p className="text-xs text-slate-400 mb-2">{SOS_DATA_HUB.description}</p>
            <DownloadSteps steps={SOS_DATA_HUB.downloadSteps} />
            <div className="mt-3">
              <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wide">Example pages</div>
              {SOS_DATA_HUB.examplePages.map(page => (
                <div key={page} className="text-[11px] font-mono text-indigo-400">{page}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Census data fetch */}
      <div className="card">
        <div className="section-title mb-2">U.S. Census Population Data</div>
        <p className="text-xs text-slate-500 mb-3">
          Fetched directly from <code className="font-mono text-indigo-300">api.census.gov</code> (CORS-enabled, no script required).
          Population data is used only as demographic context — never as voter registration or partisan data.
        </p>
        <div className="p-3 bg-amber-900/10 border border-amber-700/30 rounded-lg text-xs text-amber-300 mb-4">
          A free Census API key is now required (as of 2025). Get one at{' '}
          <span className="font-mono">api.census.gov/data/key_signup.html</span> — keys are issued instantly by email.
        </div>

        <div className="space-y-3 mb-4">
          <div>
            <label className="stat-label block mb-1">Census Datasets</label>
            <div className="space-y-1.5">
              {CENSUS_DATASETS.map(ds => (
                <label key={ds.id} className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 accent-indigo-500"
                    checked={selectedCensus.includes(ds.id)}
                    onChange={e => setSelectedCensus(prev =>
                      e.target.checked ? [...prev, ds.id] : prev.filter(id => id !== ds.id)
                    )} />
                  <div>
                    <div className="text-xs text-slate-300">{ds.label}</div>
                    {ds.description && (
                      <div className="text-[11px] text-slate-500">{ds.description}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="stat-label block mb-1">
              Census API Key <span className="text-red-400">*</span>
              <span className="text-slate-600 font-normal ml-1">(required — free at api.census.gov/data/key_signup.html)</span>
            </label>
            <input
              value={censusKey}
              onChange={e => setCensusKey(e.target.value)}
              placeholder="Paste API key here (optional)"
              className="w-full bg-navy-700 border border-navy-500 rounded-lg px-3 py-1.5 text-sm text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <button
          onClick={handleFetchCensus}
          disabled={!selectedCensus.length || censusStatus.loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
          {censusStatus.loading ? 'Fetching…' : `Fetch ${selectedCensus.length} Census Dataset(s)`}
        </button>

        {censusStatus.success && (
          <p className="text-xs text-emerald-400 mt-2">
            ✓ {censusStatus.records} county population records loaded as context.
          </p>
        )}
        {censusStatus.error && (
          <p className="text-xs text-red-400 mt-2">✗ {censusStatus.error}</p>
        )}
      </div>

      {/* Voter registration import */}
      <div className="card border-indigo-900/40">
        <div className="section-title mb-2">Voter Registration Data</div>
        <div className="text-xs text-slate-400 space-y-2">
          <div className="p-3 bg-indigo-900/20 border border-indigo-700/30 rounded-lg text-indigo-200">
            <strong>Georgia is a non-partisan registration state.</strong> Voter registration totals are used
            <em> only as a turnout denominator</em> (total ballots ÷ registered voters).
            They carry no party affiliation.
          </div>
          <p>Download from the Georgia SOS voter registration portal:</p>
          <a href={SOS_VOTER_REG.baseUrl} target="_blank" rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 block font-mono text-[11px]">
            {SOS_VOTER_REG.baseUrl} ↗
          </a>
          <DownloadSteps steps={SOS_VOTER_REG.downloadSteps} />
          <div className="mt-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Required CSV columns</div>
            <div className="font-mono bg-navy-800 rounded p-2 text-[11px] text-indigo-300">
              {SOS_VOTER_REG.requiredColumns.join(', ')}
            </div>
          </div>
        </div>
      </div>

      {/* Source registry (collapsible) */}
      <div className="card">
        <button
          onClick={() => setShowRegistry(!showRegistry)}
          className="w-full flex items-center justify-between text-left">
          <div className="section-title">Full Source Registry</div>
          <span className="text-slate-500">{showRegistry ? '▲' : '▼'}</span>
        </button>

        {showRegistry && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-navy-500">
                  <th className="text-left py-2 pr-4">Source</th>
                  <th className="text-left py-2 pr-4">Category</th>
                  <th className="text-left py-2 pr-4">Access</th>
                  <th className="text-left py-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {SOURCE_REGISTRY.map(src => (
                  <tr key={src.id} className="border-b border-navy-700 hover:bg-navy-700/20">
                    <td className="py-2 pr-4">
                      <div className="text-slate-200 font-medium">{src.name}</div>
                      <div className="text-slate-600 text-[10px] font-mono">{src.id}</div>
                    </td>
                    <td className="py-2 pr-4 text-slate-400">{src.category}</td>
                    <td className="py-2 pr-4"><AccessBadge access={src.access} /></td>
                    <td className="py-2 text-slate-500 text-[11px]">
                      {src.description?.slice(0, 120)}{src.description?.length > 120 ? '…' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Import audit log */}
      <div className="card">
        <button
          onClick={() => setShowAudit(!showAudit)}
          className="w-full flex items-center justify-between text-left">
          <div className="section-title">Import Audit Log ({auditEntries.length})</div>
          <span className="text-slate-500">{showAudit ? '▲' : '▼'}</span>
        </button>

        {showAudit && (
          <div className="mt-4">
            <p className="text-xs text-slate-500 mb-3">
              Every import, fetch, and normalization event is recorded here with source URL, record counts,
              and validation results. Persists in localStorage between sessions.
            </p>
            {auditEntries.length === 0 ? (
              <p className="text-sm text-slate-600 italic">No audit entries yet.</p>
            ) : (
              auditEntries.map(entry => <AuditEntry key={entry.id} entry={entry} />)
            )}
            {auditEntries.length > 0 && (
              <button
                onClick={() => {
                  const blob = new Blob([AuditLog.exportJSON()], { type: 'application/json' })
                  const url  = URL.createObjectURL(blob)
                  const a    = Object.assign(document.createElement('a'), {
                    href: url, download: 'pipeline-audit-log.json'
                  })
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                className="mt-3 px-3 py-1.5 border border-navy-400 text-slate-400 hover:text-slate-200 text-xs rounded-lg transition-colors">
                Export Audit Log (JSON)
              </button>
            )}
          </div>
        )}
      </div>

      {/* CLI reference */}
      <div className="card">
        <div className="section-title mb-3">CLI Script Reference</div>
        <div className="p-3 bg-amber-900/10 border border-amber-700/30 rounded-lg text-xs text-amber-300 mb-4">
          Note: <code className="font-mono">fetch-sos.mjs</code> uses the Clarity Elections API which currently
          returns HTTP 403. The Census and file import scripts work correctly.
        </div>
        <div className="space-y-3 text-xs font-mono">
          {[
            ['Census only (works)',            'node scripts/fetch-census.mjs'],
            ['Census with API key',            'node scripts/fetch-census.mjs --api-key YOUR_KEY'],
            ['Census specific year',           'node scripts/fetch-census.mjs --year 2020'],
            ['Full pipeline (SOS blocked)',    'node scripts/run-pipeline.mjs --skip-sos'],
            ['SOS fetch (currently blocked)',  'node scripts/fetch-sos.mjs --all'],
          ].map(([label, cmd]) => (
            <div key={cmd}>
              <div className="text-slate-500 text-[10px] mb-0.5">{label}</div>
              <div className="bg-navy-800 rounded px-3 py-1.5 text-indigo-300 text-[11px]">{cmd}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-600 mt-3 italic">Requires Node.js 18+. Run from project root.</p>
      </div>
    </div>
  )
}
