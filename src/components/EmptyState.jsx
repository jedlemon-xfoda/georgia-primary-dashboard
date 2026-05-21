// Shown whenever a view requires data that has not yet been imported.
// No estimates or placeholders are displayed — only the reason data is absent
// and a direct path to import real data.

import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

const DATA_SOURCES = [
  {
    title: 'Georgia SOS Election Results',
    desc: 'Official county-level primary results from the Georgia Secretary of State.',
    url: 'https://results.enr.clarityelections.com/GA/',
    format: 'CSV export per election',
  },
  {
    title: 'Georgia SOS Historical Results',
    desc: 'Past primary election archives available on the SOS Elections Division website.',
    url: 'https://sos.ga.gov/page/elections-division',
    format: 'CSV / county export',
  },
  {
    title: 'Voter Registration Totals',
    desc: 'Active and inactive registered voter counts by county. Used only as a turnout denominator — Georgia has no party registration.',
    url: 'https://sos.ga.gov/page/voter-registration-statistics',
    format: 'CSV (county-level)',
  },
  {
    title: 'U.S. Census / ACS Population Data',
    desc: 'County population estimates for contextual analysis.',
    url: 'https://data.census.gov/',
    format: 'CSV download',
  },
]

export default function EmptyState({ context = 'data', minimal = false }) {
  const navigate = useNavigate()

  if (minimal) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <div className="text-slate-600 text-4xl mb-4">∅</div>
        <p className="text-slate-400 text-sm mb-4">
          No {context} available. Import real election data to enable this view.
        </p>
        <button
          onClick={() => navigate('/import')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Import Data
        </button>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto px-4 py-12"
    >
      {/* Status */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-navy-700 border border-navy-500 text-xs text-slate-400 mb-6">
          <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
          No election data imported
        </div>
        <h2 className="text-2xl font-bold text-slate-100 mb-3">
          Import Real Election Data to Begin
        </h2>
        <p className="text-slate-400 text-sm leading-relaxed max-w-xl mx-auto">
          This dashboard contains no built-in, sample, or estimated data.
          Every chart, anomaly flag, and statistical calculation derives exclusively
          from data you import. Missing data is labeled as missing — never estimated.
        </p>
      </div>

      {/* Import CTA */}
      <div className="flex justify-center mb-10">
        <button
          onClick={() => navigate('/import')}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-900/40"
        >
          Go to Import Data
        </button>
      </div>

      {/* Data sources */}
      <div className="card mb-6">
        <div className="section-title">Accepted Data Sources</div>
        <div className="space-y-4">
          {DATA_SOURCES.map(src => (
            <div key={src.title} className="flex gap-4 pb-4 border-b border-navy-600 last:border-0 last:pb-0">
              <div className="w-1 shrink-0 rounded-full bg-indigo-600/60 self-stretch" />
              <div>
                <div className="text-sm font-semibold text-slate-200">{src.title}</div>
                <p className="text-xs text-slate-400 mt-0.5">{src.desc}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-xs text-slate-600">Format: {src.format}</span>
                  <span className="text-slate-700">·</span>
                  <span className="text-xs text-indigo-400">{src.url}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CSV format reference */}
      <div className="card mb-6">
        <div className="section-title">Minimum Required CSV Columns</div>
        <p className="text-xs text-slate-500 mb-3">
          The importer auto-detects column names and common variations.
          Only <code className="text-indigo-400">county</code>, <code className="text-indigo-400">year</code>,
          and <code className="text-indigo-400">votes</code> are strictly required.
          All other columns enrich the analysis if present.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-xs">
          {[
            ['county',              'County name — required'],
            ['year',                'Election year — required'],
            ['votes',               'Vote count — required'],
            ['office',              'Race / office name'],
            ['candidate',           'Candidate name'],
            ['party',               'REP · DEM · LIB · NP'],
            ['election_day_votes',  'Election Day sub-total'],
            ['early_votes',         'Advance / early voting sub-total'],
            ['absentee_votes',      'Absentee / mail sub-total'],
            ['registered_voters',   'Turnout denominator only — not partisan'],
            ['election_type',       'e.g. Midterm Primary'],
            ['official_status',     'Official · Unofficial · Historical'],
          ].map(([col, desc]) => (
            <div key={col} className="flex gap-2 py-1 border-b border-navy-700 last:border-0">
              <span className="text-indigo-400 shrink-0 w-40">{col}</span>
              <span className="text-slate-500">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Data integrity notes */}
      <div className="card">
        <div className="section-title">What This Dashboard Will and Will Not Do</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <div className="text-emerald-400 font-semibold mb-2">Will do</div>
            <ul className="space-y-1.5 text-slate-400">
              <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span> Calculate z-scores and standard deviations from your data</li>
              <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span> Compare cycles only when both are present in imports</li>
              <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span> Label fields as "—" when data is absent</li>
              <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span> Show confidence scores based on actual baseline sample size</li>
              <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span> Preserve full import audit trail with timestamps</li>
              <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span> Never overwrite historical imports</li>
            </ul>
          </div>
          <div>
            <div className="text-red-400 font-semibold mb-2">Will not do</div>
            <ul className="space-y-1.5 text-slate-400">
              <li className="flex gap-2"><span className="text-red-500 shrink-0">✗</span> Generate, estimate, or interpolate missing vote totals</li>
              <li className="flex gap-2"><span className="text-red-500 shrink-0">✗</span> Inject synthetic anomalies for demonstration</li>
              <li className="flex gap-2"><span className="text-red-500 shrink-0">✗</span> Apply assumed voter registration counts</li>
              <li className="flex gap-2"><span className="text-red-500 shrink-0">✗</span> Assign partisan leans to counties by assumption</li>
              <li className="flex gap-2"><span className="text-red-500 shrink-0">✗</span> Draw conclusions or establish causation</li>
              <li className="flex gap-2"><span className="text-red-500 shrink-0">✗</span> Show charts or flags when data is missing</li>
            </ul>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
