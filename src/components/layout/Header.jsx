import { motion } from 'framer-motion'
import useElectionStore from '../../store/electionStore.js'

export default function Header() {
  const getLatestYear = useElectionStore(s => s.getLatestYear)
  const anomalies     = useElectionStore(s => s.anomalies)

  const latestYear = getLatestYear()

  const redCount    = anomalies.filter(a => a.severity === 'RED').length
  const yellowCount = anomalies.filter(a => a.severity === 'YELLOW').length

  return (
    <header className="border-b border-navy-500 bg-navy-900/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center">
                <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight leading-tight">
                  Georgia Open Primary Intelligence Dashboard
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Longitudinal ballot participation analysis · Statistical deviation reporting
                </p>
              </div>
            </div>

            <div className="mt-2 ml-11 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                Georgia does not register voters by party
              </span>
              <span className="hidden sm:flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                Primary voters choose which party ballot to pull
              </span>
              <span className="hidden md:flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                Charts measure ballot selection and participation patterns
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {latestYear && (
              <div className="hidden sm:block text-right">
                <div className="text-xs text-slate-500">Latest cycle</div>
                <div className="text-sm font-semibold text-slate-200">{latestYear}</div>
              </div>
            )}

            {(redCount > 0 || yellowCount > 0) && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-2"
              >
                {redCount > 0 && (
                  <div className="badge-red">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block animate-pulse" />
                    {redCount} RED
                  </div>
                )}
                {yellowCount > 0 && (
                  <div className="badge-yellow">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                    {yellowCount} YELLOW
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
