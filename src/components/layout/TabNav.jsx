import { useNavigate, useLocation } from 'react-router-dom'
import useElectionStore from '../../store/electionStore.js'

const TABS = [
  { id: 'statewide',     path: '/',              label: 'Statewide Trends' },
  { id: 'county',        path: '/county',        label: 'County Intelligence' },
  { id: 'participation', path: '/participation', label: 'Participation Shift' },
  { id: 'anomalies',     path: '/anomalies',     label: 'Anomaly Report' },
  { id: 'rolloff',       path: '/rolloff',       label: 'Ballot Roll-Off' },
  { id: 'races',         path: '/races',         label: 'Race Explorer' },
  { id: 'methodology',  path: '/methodology',   label: 'Methodology' },
  { id: 'import',        path: '/import',        label: 'Import Data' },
]

export default function TabNav() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const anomalies = useElectionStore(s => s.anomalies)
  const redCount  = anomalies.filter(a => a.severity === 'RED').length

  const active = TABS.find(t => t.path === location.pathname)?.id || 'statewide'

  return (
    <div className="border-b border-navy-500 bg-navy-900/60 sticky top-[73px] z-30">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6">
        <nav className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-hide">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`tab-btn relative ${active === tab.id ? 'tab-btn-active' : 'tab-btn-inactive'}`}
            >
              {tab.label}
              {tab.id === 'anomalies' && redCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {redCount > 9 ? '9+' : redCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
