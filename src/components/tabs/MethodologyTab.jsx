import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useElectionStore from '../../store/electionStore.js'
import { ENGINE_METADATA } from '../../services/AnomalyEngine.js'
import { fmt, stoplightColor, anomalyCategory } from '../../utils/formatters.js'

function Section({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card mb-4">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left">
        <div className="text-base font-semibold text-slate-200">{title}</div>
        <span className="text-slate-500 text-lg">{open ? '▲' : '▼'}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="mt-4 border-t border-navy-600 pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Formula({ label, expr, note }) {
  return (
    <div className="mb-4">
      {label && <div className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">{label}</div>}
      <code className="block bg-navy-700 rounded-lg px-4 py-3 text-sm text-indigo-300 font-mono whitespace-pre-wrap">{expr}</code>
      {note && <p className="text-xs text-slate-500 mt-1.5">{note}</p>}
    </div>
  )
}

function AnomalyDetailBlock({ anomaly }) {
  const sc  = stoplightColor(anomaly.severity)
  const cat = anomalyCategory[anomaly.category] || {}
  const isPercent = anomaly.metric?.includes('share') || anomaly.metric?.includes('rate') || anomaly.metric?.includes('fraction')
  const fmtVal = (v) => v == null ? '—' : typeof v !== 'number' ? v : isPercent ? fmt.pct(v) : fmt.number(v, 4)

  return (
    <div className={`rounded-xl p-4 mb-4 border ${sc.bg} ${sc.border}`}>
      <div className="flex items-start gap-3 mb-3">
        <div>
          <span className={`text-xs font-bold uppercase ${sc.text}`}>{anomaly.severity}</span>
          <span className="text-slate-500 text-xs ml-2">Category {anomaly.category} — {cat.label}</span>
          <span className="text-slate-600 text-xs ml-2">{anomaly.id}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs text-slate-500 font-semibold uppercase mb-2">What Was Measured</div>
          <p className="text-slate-300">{anomaly.metric}</p>
          <p className="text-slate-400 text-xs mt-1"><strong>Jurisdiction:</strong> {anomaly.jurisdiction} · <strong>Race:</strong> {anomaly.race}</p>
        </div>
        <div>
          <div className="text-xs text-slate-500 font-semibold uppercase mb-2">Observed vs. Expected</div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Historical baseline mean</span>
              <span className="text-slate-300 font-medium">{fmtVal(anomaly.expected)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Observed value</span>
              <span className={`font-bold ${sc.text}`}>{fmtVal(anomaly.actual)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Deviation</span>
              <span className={`font-medium ${sc.text}`}>{anomaly.deviation != null ? `${anomaly.deviation > 0 ? '+' : ''}${(anomaly.deviation * 100).toFixed(2)}%` : '—'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Z-score</span>
              <span className="text-slate-200 font-mono">{fmt.zScore(anomaly.zScore)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Baseline sample (n)</span>
              <span className="text-slate-200">{anomaly.n} prior comparable cycle(s)</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Confidence score</span>
              <span className="text-slate-200">{anomaly.confidence != null ? `${(anomaly.confidence * 100).toFixed(0)}%` : '—'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs text-slate-500 font-semibold uppercase mb-1.5">Formula Applied</div>
        <code className="block bg-navy-800/80 rounded-lg px-3 py-2 text-xs text-indigo-300 font-mono">{anomaly.formula}</code>
      </div>

      {anomaly.assumptions?.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-slate-500 font-semibold uppercase mb-1.5">Assumptions</div>
          <ul className="space-y-1">
            {anomaly.assumptions.map((a, i) => (
              <li key={i} className="text-xs text-slate-400 flex gap-2">
                <span className="text-slate-600 shrink-0">·</span>{a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {anomaly.historicalValues?.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-slate-500 font-semibold uppercase mb-1.5">Baseline Values Used</div>
          <div className="flex flex-wrap gap-2">
            {anomaly.historicalValues.map(({ year, value }) => (
              <span key={year} className="bg-navy-800/80 rounded px-2 py-1 text-xs">
                <span className="text-slate-500">{year}:</span> <span className="text-slate-300">{fmtVal(value)}</span>
              </span>
            ))}
            <span className={`rounded px-2 py-1 text-xs border ${sc.border}`}>
              <span className="text-slate-500">{anomaly.year} (obs.):</span> <span className={`font-bold ${sc.text}`}>{fmtVal(anomaly.actual)}</span>
            </span>
          </div>
        </div>
      )}

      <div className="mt-3 p-2.5 bg-navy-800/60 rounded-lg text-xs text-slate-500">
        <strong className="text-slate-400">Neutral Explanation:</strong> {anomaly.explanation}
      </div>
    </div>
  )
}

export default function MethodologyTab() {
  const hasData   = useElectionStore(s => s.hasData)
  const anomalies = useElectionStore(s => s.anomalies)
  const dims      = useElectionStore(s => s.dims)
  const snapshots = useElectionStore(s => s.snapshots)

  const [filterCat, setCat] = useState('All')
  const [filterSev, setSev] = useState('All')

  const filteredAnomalies = anomalies.filter(a => {
    if (filterCat !== 'All' && String(a.category) !== filterCat) return false
    if (filterSev !== 'All' && a.severity !== filterSev)          return false
    return true
  })

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-100">Methodology</h2>
        <p className="text-sm text-slate-400 mt-1">
          Complete explanation of every formula, assumption, and threshold used in this dashboard.
          Every anomaly flag is fully auditable and reproducible from first principles.
        </p>
      </div>

      {/* Foundational context */}
      <Section title="Georgia Open Primary System" defaultOpen>
        <div className="space-y-3 text-sm text-slate-300">
          <p>
            Georgia holds <strong className="text-slate-100">open primaries</strong>. Voters are not registered by party and may choose which party's ballot to pull on primary election day.
            This system has been in place since 1980 under Georgia law.
          </p>
          <p>
            This dashboard measures <strong className="text-slate-100">ballot selection</strong> (the choice a voter makes when picking which party's ballot to use) and
            <strong className="text-slate-100"> participation patterns</strong> (total ballots cast, turnout rates, and vote method distributions).
          </p>
          <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 text-amber-200 text-xs">
            <strong>Critical distinction:</strong> Because Georgia has no party registration, this dashboard never uses the phrase "registered Republican" or "registered Democrat."
            Voter registration data is used only as a turnout denominator (total ballots / registered voters = turnout rate). It carries no partisan interpretation.
          </div>
          <p>
            Observed patterns in ballot selection data may result from any combination of: candidate competitiveness, campaign mobilization efforts,
            demographic changes, geographic sorting, local issues, national political dynamics, possible crossover behavior, or other factors.
            <strong className="text-white"> This system does not determine cause.</strong>
          </p>
        </div>
      </Section>

      {/* Statistical methods */}
      <Section title="Statistical Methods">
        <div className="space-y-4 text-sm text-slate-300">
          <Formula
            label="Z-Score (Core Deviation Measure)"
            expr={`z = (observed_value − historical_baseline_mean) / historical_baseline_std_dev`}
            note="A z-score measures how many standard deviations an observed value is from the historical mean. All anomaly detection uses z-scores against prior comparable cycles."
          />
          <Formula
            label="Sample Standard Deviation (Bessel-Corrected)"
            expr={`s = sqrt( Σ(xᵢ − x̄)² / (n − 1) )`}
            note="Bessel's correction (dividing by n−1) is used to obtain an unbiased estimate from a sample of historical cycles. Minimum n=2 required to generate any flag."
          />
          <Formula
            label="Confidence Score"
            expr={`confidence = 0.6 × min(1, (n − 1) / 4) + 0.4 × min(1, |z| / 4)

  n-factor: saturates at n=5 (full baseline coverage)
  z-factor: saturates at |z|=4 (extreme deviation)`}
            note="Confidence is a 0–1 score. Low confidence (small n) does not reduce severity — it means the baseline is thin and results should be interpreted cautiously."
          />
          <Formula
            label="Participation Shift Index (PSI)"
            expr={`PSI = min(100, (|ballotSelectionZ| × 0.40 + |turnoutZ| × 0.30 + |countyDivergenceZ| × 0.30) × 33.33)

  Scaled so z=3 in all components → PSI ≈ 100
  Labels: 0–25 Low · 25–50 Moderate · 50–75 Elevated · 75–100 High`}
            note="PSI is a composite indicator. It is a possible behavior change indicator only. Multiple equally plausible explanations exist for any PSI value."
          />
          <Formula
            label="Ballot Roll-Off"
            expr={`roll_off = 1 − (lower_race_votes / top_race_votes)
roll_off_pct = roll_off × 100`}
            note="Top race is defined as the office with the highest total votes in that cycle and county. Roll-off is calculated separately for Republican and Democratic ballots."
          />
          <Formula
            label="Turnout Rate"
            expr={`turnout_rate = total_primary_ballots / registered_voters

  Note: registered_voters is used as denominator only.
  Georgia has no party registration — this value is not partisan.`}
            note="Total primary ballots = Republican ballots + Democratic ballots (and any other ballot types)."
          />
        </div>
      </Section>

      {/* Stoplight thresholds */}
      <Section title="Stoplight Threshold System">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { sev: 'GREEN',  rule: '|z| < 2.0',   desc: 'Within historical norms. Deviation is within 2 standard deviations of the baseline mean.', color: 'border-emerald-700/50 bg-emerald-900/20' },
              { sev: 'YELLOW', rule: '2.0 ≤ |z| < 3.0', desc: 'Moderate deviation. Statistically uncommon under normal conditions. Warrants additional review.', color: 'border-amber-700/50 bg-amber-900/20' },
              { sev: 'RED',    rule: '|z| ≥ 3.0 or multi-category escalation', desc: 'High deviation. Very uncommon under normal conditions. Multiple simultaneous category flags also escalate to RED.', color: 'border-red-700/50 bg-red-900/20' },
            ].map(({ sev, rule, desc, color }) => (
              <div key={sev} className={`rounded-xl p-4 border ${color}`}>
                <div className={`text-sm font-bold mb-1 ${sev === 'GREEN' ? 'text-emerald-400' : sev === 'YELLOW' ? 'text-amber-400' : 'text-red-400'}`}>{sev}</div>
                <div className="font-mono text-xs text-indigo-300 mb-2">{rule}</div>
                <p className="text-xs text-slate-400">{desc}</p>
              </div>
            ))}
          </div>
          <div className="bg-navy-700/40 rounded-lg p-3 text-xs text-slate-400">
            <strong className="text-slate-300">Multi-category escalation:</strong> If a single jurisdiction/cycle accumulates ≥3 YELLOW flags, or ≥2 YELLOW flags across different anomaly categories,
            all YELLOW flags in that group escalate to RED. This reflects the compounding statistical improbability of multiple simultaneous deviations.
          </div>
          <div className="bg-navy-700/40 rounded-lg p-3 text-xs text-slate-400">
            <strong className="text-slate-300">Interpretation warning:</strong> A RED flag means the observation is statistically unusual relative to historical baselines in this dataset.
            It does not mean fraud occurred, that any specific actor caused the deviation, or that any particular explanation is correct.
            All RED flags require independent contextual investigation before any conclusion can be drawn.
          </div>
        </div>
      </Section>

      {/* Seven anomaly categories */}
      <Section title="Seven Anomaly Categories — Definitions & Formulas">
        <div className="space-y-4 text-sm">
          {ENGINE_METADATA.categories.map(cat => (
            <div key={cat.id} className="border border-navy-500 rounded-xl p-4">
              <div className="flex items-start gap-3 mb-2">
                <span className="bg-indigo-900/40 text-indigo-400 border border-indigo-700/40 rounded px-2 py-0.5 text-xs font-bold shrink-0">Cat {cat.id}</span>
                <div>
                  <div className="text-slate-200 font-semibold">{cat.name}</div>
                  <p className="text-slate-400 text-xs mt-0.5">{cat.description}</p>
                </div>
              </div>
              <div className="ml-12">
                {{
                  1: <Formula label="" expr={`R_share = Σ(R_candidate_votes) / Σ(total_candidate_votes)
z = (R_share_current − mean(R_share_prior_comparable)) / sampleStdDev(R_share_prior_comparable)
Requires: n ≥ 2 prior comparable cycles · Minimum 100 total votes`} />,
                  2: <Formula label="" expr={`turnout = total_ballots / registered_voters
z = (turnout_current − mean(turnout_prior_comparable)) / sampleStdDev(turnout_prior_comparable)
Requires: n ≥ 2 prior cycles · registered_voters > 1000`} />,
                  3: <Formula label="" expr={`R_share = R_ballots / (R_ballots + D_ballots)
z = (R_share_current − mean(R_share_prior_comparable)) / sampleStdDev(R_share_prior_comparable)
Source: BALLOT_TOTALS records (total ballot-type selections)`} />,
                  4: <Formula label="" expr={`absentee_pct = absentee_votes / total_R_ballots
z = (absentee_pct_current − mean(absentee_pct_prior)) / sampleStdDev(absentee_pct_prior)
Flags if absentee vote fraction deviates from historical range`} />,
                  5: <Formula label="" expr={`roll_off = 1 − (office_votes / top_office_votes)
z = (roll_off_current − mean(roll_off_prior)) / sampleStdDev(roll_off_prior)
Calculated separately per ballot type and per office`} />,
                  6: <Formula label="" expr={`county_mean = mean(all_precinct_R_shares)
county_sd   = stdDev(all_precinct_R_shares)
z = (precinct_R_share − county_mean) / county_sd
Requires: ≥ 4 precincts with data · within-cycle deviation only`} />,
                  7: <Formula label="" expr={`turnout = total_ballots / contextual_registered_voters
z = (turnout_current − mean(turnout_prior_contextual)) / sampleStdDev(turnout_prior_contextual)
Only triggers when supplemental voter registration data is imported`} />,
                }[cat.id]}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Data sources */}
      <Section title="Data Sources & Import History">
        <div className="text-sm text-slate-300 space-y-3">
          <p>This dashboard ingests data from these source types:</p>
          <ul className="space-y-2 text-slate-400">
            <li className="flex gap-2"><span className="text-indigo-400">·</span> Georgia Secretary of State election result exports (CSV)</li>
            <li className="flex gap-2"><span className="text-indigo-400">·</span> County-level election result files (CSV/JSON)</li>
            <li className="flex gap-2"><span className="text-indigo-400">·</span> User-uploaded files (auto-detected format)</li>
            <li className="flex gap-2"><span className="text-indigo-400">·</span> Pasted CSV or JSON text</li>
            <li className="flex gap-2"><span className="text-indigo-400">·</span> Supplemental contextual data (voter registration totals, population)</li>
          </ul>
          <p className="text-xs text-slate-500">
            All imports are additive. Historical data is never overwritten. Each import is stamped with source, date, and status.
          </p>

          <div className="mt-4">
            <div className="stat-label mb-2">Import Snapshots ({snapshots.length})</div>
            {snapshots.length === 0 ? (
              <p className="text-xs text-slate-600 italic">No data has been imported yet. Use the Import Data tab to load election records.</p>
            ) : (
              <div className="space-y-2">
                {snapshots.map(s => (
                  <div key={s.id} className="bg-navy-700/40 rounded-lg px-3 py-2 text-xs">
                    <span className="text-slate-200">{s.label}</span>
                    <span className="text-slate-500 ml-2">·</span>
                    <span className="text-slate-400 ml-2">{s.source}</span>
                    <span className="text-slate-500 ml-2">·</span>
                    <span className="text-slate-400 ml-2">{s.recordCount?.toLocaleString()} records</span>
                    <span className="text-slate-500 ml-2">·</span>
                    <span className="text-slate-400 ml-2">{new Date(s.importedAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Per-anomaly audit log */}
      <Section title={`Per-Anomaly Audit Log (${anomalies.length} flags) — Full Reproducibility`}>
        <div className="mb-4 flex flex-wrap gap-3">
          <div>
            <label className="stat-label block mb-1">Filter Category</label>
            <select value={filterCat} onChange={e => setCat(e.target.value)} className="filter-select">
              <option value="All">All Categories</option>
              {ENGINE_METADATA.categories.map(c => (
                <option key={c.id} value={String(c.id)}>{c.id}. {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="stat-label block mb-1">Filter Severity</label>
            <select value={filterSev} onChange={e => setSev(e.target.value)} className="filter-select">
              <option value="All">All Severities</option>
              <option value="RED">RED</option>
              <option value="YELLOW">YELLOW</option>
            </select>
          </div>
          <div className="self-end text-xs text-slate-500">
            Showing {filteredAnomalies.length} of {anomalies.length} anomalies
          </div>
        </div>

        <p className="text-xs text-slate-500 mb-4">
          Each block below is a complete audit record: metric measured, formula applied, assumptions stated, baseline values used, z-score, confidence score, and neutral explanation.
          Any analyst can reproduce these results from the imported source data using the formulas above.
        </p>

        {filteredAnomalies.length === 0 && (
          <div className="text-slate-500 text-sm py-4 text-center">
            {!hasData
              ? 'No data imported. Import election records from the Import Data tab to generate anomaly audit entries.'
              : anomalies.length === 0
                ? 'No anomalies detected. Import multiple comparable election cycles (≥2) to enable baseline analysis.'
                : 'No anomalies match current filters.'}
          </div>
        )}

        {filteredAnomalies.map(a => (
          <AnomalyDetailBlock key={a.id} anomaly={a} />
        ))}
      </Section>

      {/* Limitations */}
      <Section title="Limitations & Neutrality Guarantees">
        <div className="space-y-3 text-sm text-slate-300">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { title: 'No Causation', body: 'Statistical deviations are indicators for review. They do not establish that fraud occurred, that any actor caused the anomaly, or that any specific explanation is correct.' },
              { title: 'No Narratives', body: 'All language is descriptive. The system generates observed values, baselines, deviations, and z-scores. It never generates headlines, conclusions, or persuasive framing.' },
              { title: 'Baseline Sensitivity', body: 'Results depend on the quality and completeness of imported historical data. Thin baselines (n<3) produce lower-confidence flags. Import more cycles to improve reliability.' },
              { title: 'Open Primary Context', body: 'All ballot-selection analysis reflects voter self-selection of ballot type in an open primary. The same voter may select different ballots in different cycles. This is legal and expected behavior.' },
              { title: 'Multiple Explanations', body: 'Patterns may result from: candidate quality, contested vs. uncontested races, campaign mobilization, media coverage, demographic shifts, weather, ballot changes, or any other factor.' },
              { title: 'Reproducibility', body: 'Every flag in the Per-Anomaly Audit Log is fully reproducible. The formula, baseline values, and observed value are all recorded. No calculation is hidden or proprietary.' },
            ].map(({ title, body }) => (
              <div key={title} className="card-sm">
                <div className="text-sm font-semibold text-slate-200 mb-1">{title}</div>
                <p className="text-xs text-slate-400">{body}</p>
              </div>
            ))}
          </div>
          <div className="bg-navy-700/30 border border-navy-500 rounded-lg p-4 text-xs text-slate-400 mt-4">
            <strong className="text-slate-300">Engine version:</strong> {ENGINE_METADATA.version} ·
            <strong className="text-slate-300 ml-2">Baseline method:</strong> {ENGINE_METADATA.baselineMethod} ·
            <strong className="text-slate-300 ml-2">Minimum baseline:</strong> {ENGINE_METADATA.minimumBaseline}
          </div>
        </div>
      </Section>
    </div>
  )
}
