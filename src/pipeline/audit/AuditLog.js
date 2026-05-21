// Pipeline Audit Log
// Every import, normalization decision, and validation event is recorded here.
// Persists to localStorage. Exportable as JSON.

import { STORAGE_KEYS } from '../schema.js'

const MAX_ENTRIES = 500

export function createAuditEntry({
  action,         // 'import' | 'normalize' | 'validate' | 'pipeline_fetch' | 'census_fetch' | 'clear'
  source,         // human-readable source label
  sourceUrl,      // URL if applicable
  sourceFile,     // filename if applicable
  sourceType,     // SOURCE.* constant
  recordCount,    // total records processed
  newRecords,     // records added (not duplicates)
  duplicates,     // records skipped as duplicates
  rejected,       // records that failed validation
  normalizationLog,  // array of { field, from, to, count } — what was renamed/mapped
  validationErrors,  // array of { field, reason, count }
  changeHistory,     // array of { action, recordId, field, before, after }
  rawFileInfo,       // { name, size, type, lastModified }
  electionYears,     // years represented in the import
  counties,          // county count
  error,             // error message if failed
  status,            // 'success' | 'partial' | 'failed'
}) {
  return {
    id:               `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp:        new Date().toISOString(),
    action:           action || 'import',
    source:           source || 'Unknown',
    sourceUrl:        sourceUrl || null,
    sourceFile:       sourceFile || null,
    sourceType:       sourceType || null,
    recordCount:      recordCount ?? 0,
    newRecords:       newRecords ?? 0,
    duplicates:       duplicates ?? 0,
    rejected:         rejected ?? 0,
    normalizationLog: normalizationLog || [],
    validationErrors: validationErrors || [],
    changeHistory:    changeHistory || [],
    rawFileInfo:      rawFileInfo || null,
    electionYears:    electionYears || [],
    counties:         counties ?? 0,
    error:            error || null,
    status:           status || 'success',
  }
}

class PipelineAuditLog {
  constructor() {
    this._entries = null
  }

  _load() {
    if (this._entries) return
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.AUDIT_LOG)
      this._entries = raw ? JSON.parse(raw) : []
    } catch {
      this._entries = []
    }
  }

  _save() {
    try {
      // Keep only the most recent MAX_ENTRIES
      const trimmed = this._entries.slice(-MAX_ENTRIES)
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOG, JSON.stringify(trimmed))
    } catch (e) {
      console.warn('Audit log: localStorage quota exceeded', e)
    }
  }

  addEntry(entry) {
    this._load()
    this._entries.push(entry)
    this._save()
    return entry
  }

  getEntries() {
    this._load()
    return [...this._entries].reverse()
  }

  getEntry(id) {
    this._load()
    return this._entries.find(e => e.id === id) || null
  }

  getEntriesByAction(action) {
    this._load()
    return this._entries.filter(e => e.action === action).reverse()
  }

  getSummary() {
    this._load()
    const total      = this._entries.length
    const successful = this._entries.filter(e => e.status === 'success').length
    const failed     = this._entries.filter(e => e.status === 'failed').length
    const totalRecs  = this._entries.reduce((s, e) => s + (e.newRecords || 0), 0)
    const lastEntry  = this._entries[this._entries.length - 1] || null
    return { total, successful, failed, totalRecs, lastEntry }
  }

  exportJSON() {
    this._load()
    return JSON.stringify(this._entries, null, 2)
  }

  clear() {
    this._entries = []
    localStorage.removeItem(STORAGE_KEYS.AUDIT_LOG)
  }
}

// Singleton
export const AuditLog = new PipelineAuditLog()

// Build a normalization log entry from before/after field mappings
export function buildNormalizationLog(mappings) {
  const counts = new Map()
  for (const { field, from, to } of mappings) {
    if (from === to) continue
    const key = `${field}:${from}→${to}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()].map(([key, count]) => {
    const [field, transform] = key.split(':')
    const [from, to] = transform.split('→')
    return { field, from, to, count }
  })
}

// Record validation errors for audit log
export function buildValidationErrorLog(errors) {
  const counts = new Map()
  for (const { field, reason } of errors) {
    const key = `${field}:${reason}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()].map(([key, count]) => {
    const colonIdx = key.indexOf(':')
    return { field: key.slice(0, colonIdx), reason: key.slice(colonIdx + 1), count }
  })
}
