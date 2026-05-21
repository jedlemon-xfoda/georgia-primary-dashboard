import { format, parseISO } from 'date-fns'

export const fmt = {
  number: (n, decimals = 0) =>
    n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: decimals }),

  pct: (n, decimals = 1) =>
    n == null ? '—' : `${Number(n * 100).toFixed(decimals)}%`,

  pctPts: (n, decimals = 1) => {
    if (n == null) return '—'
    const sign = n > 0 ? '+' : ''
    return `${sign}${(n * 100).toFixed(decimals)} pts`
  },

  zScore: (n) =>
    n == null ? '—' : `${n > 0 ? '+' : ''}${Number(n).toFixed(2)}σ`,

  date: (d) => {
    if (!d) return '—'
    try { return format(typeof d === 'string' ? parseISO(d) : d, 'MMM d, yyyy') }
    catch { return d }
  },

  shortDate: (d) => {
    if (!d) return '—'
    try { return format(typeof d === 'string' ? parseISO(d) : d, 'MM/dd/yyyy') }
    catch { return d }
  },

  votes: (n) => {
    if (n == null) return '—'
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  },

  deviation: (n) => {
    if (n == null) return '—'
    const sign = n > 0 ? '+' : ''
    return `${sign}${(n * 100).toFixed(1)} pts`
  },
}

export const stoplightColor = (severity) => {
  switch (severity) {
    case 'RED':    return { text: 'text-red-400',     bg: 'bg-red-900/40',     border: 'border-red-700/50',     dot: '#ef4444' }
    case 'YELLOW': return { text: 'text-amber-400',   bg: 'bg-amber-900/40',   border: 'border-amber-700/50',   dot: '#f59e0b' }
    case 'GREEN':  return { text: 'text-emerald-400', bg: 'bg-emerald-900/40', border: 'border-emerald-700/50', dot: '#22c55e' }
    default:       return { text: 'text-slate-400',   bg: 'bg-slate-900/40',   border: 'border-slate-700/50',   dot: '#64748b' }
  }
}

export const anomalyCategory = {
  1: { label: 'Election Result',     icon: '📊', color: 'text-blue-400' },
  2: { label: 'Turnout',             icon: '🗳️', color: 'text-purple-400' },
  3: { label: 'Ballot Selection',    icon: '🔵', color: 'text-indigo-400' },
  4: { label: 'Vote Method',         icon: '📬', color: 'text-cyan-400' },
  5: { label: 'Roll-Off',            icon: '📉', color: 'text-orange-400' },
  6: { label: 'Precinct-Level',      icon: '📍', color: 'text-pink-400' },
  7: { label: 'Contextual',          icon: '🔍', color: 'text-slate-400' },
}

export const ballotColor = {
  Republican: '#ef4444',
  Democratic: '#3b82f6',
  Other: '#a78bfa',
}

export const chartColors = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444',
  '#8b5cf6', '#14b8a6', '#f97316', '#84cc16',
]
