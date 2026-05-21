import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { motion } from 'framer-motion'
import Header from './components/layout/Header.jsx'
import TabNav from './components/layout/TabNav.jsx'
import StatewideTab    from './components/tabs/StatewideTab.jsx'
import CountyTab       from './components/tabs/CountyTab.jsx'
import ParticipationTab from './components/tabs/ParticipationTab.jsx'
import AnomalyTab      from './components/tabs/AnomalyTab.jsx'
import RolloffTab      from './components/tabs/RolloffTab.jsx'
import RaceExplorerTab from './components/tabs/RaceExplorerTab.jsx'
import DataValidationTab from './components/tabs/DataValidationTab.jsx'
import MethodologyTab  from './components/tabs/MethodologyTab.jsx'
import DataImport      from './components/import/DataImport.jsx'
import useElectionStore from './store/electionStore.js'

function PageWrapper({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  )
}

export default function App() {
  const initialize = useElectionStore(s => s.initialize)
  const hydrated   = useElectionStore(s => s.hydrated)

  useEffect(() => { initialize() }, [])

  // Block all tabs until IndexedDB load completes — prevents expensive selectors
  // from running against the empty-state store before data is available.
  if (!hydrated) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-sm text-slate-400">Loading…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-navy-950 text-slate-200">
      <Header />
      <TabNav />
      <main>
        <Routes>
          <Route path="/"             element={<PageWrapper><StatewideTab /></PageWrapper>} />
          <Route path="/county"       element={<PageWrapper><CountyTab /></PageWrapper>} />
          <Route path="/participation" element={<PageWrapper><ParticipationTab /></PageWrapper>} />
          <Route path="/anomalies"    element={<PageWrapper><AnomalyTab /></PageWrapper>} />
          <Route path="/rolloff"      element={<PageWrapper><RolloffTab /></PageWrapper>} />
          <Route path="/races"        element={<PageWrapper><RaceExplorerTab /></PageWrapper>} />
          <Route path="/validation"   element={<PageWrapper><DataValidationTab /></PageWrapper>} />
          <Route path="/methodology"  element={<PageWrapper><MethodologyTab /></PageWrapper>} />
          <Route path="/import"       element={<PageWrapper><DataImport /></PageWrapper>} />
          <Route path="*"             element={<PageWrapper><StatewideTab /></PageWrapper>} />
        </Routes>
      </main>
    </div>
  )
}
