// Pipeline — Browser-Side Orchestrator
//
// Handles all data ingestion from the browser:
//   - CSV, JSON, Excel, text file uploads
//   - Loading from pre-fetched public/data/ files (populated by /scripts/)
//   - Census API fetch (direct, CORS-allowed)
//   - Audit logging for every import action
//
// Does NOT fetch directly from Georgia SOS / Clarity (CORS-blocked).
// Use /scripts/fetch-sos.mjs for server-side SOS fetching.

import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { normalizeBatch, buildColumnIndex, normalizeRecord } from './normalizers/ElectionNormalizer.js'
import { validateBatch, isUsableRecord } from './validators/DataValidator.js'
import { AuditLog, createAuditEntry, buildNormalizationLog, buildValidationErrorLog } from './audit/AuditLog.js'
import { fetchCountyPopulation, fetchAllPopulation, toContextualData, CENSUS_DATASETS } from './sources/CensusClient.js'
import { MISSING, SOURCE, STORAGE_KEYS } from './schema.js'

// ─── Format detection ─────────────────────────────────────────────────────────

function detectFormat(file) {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || type.includes('spreadsheet') || type.includes('excel')) return 'excel'
  if (name.endsWith('.json') || type.includes('json')) return 'json'
  if (name.endsWith('.csv') || name.endsWith('.tsv') || type.includes('csv') || type.includes('text')) return 'csv'
  if (name.endsWith('.txt')) return 'csv'
  return 'csv'
}

// ─── Excel import ─────────────────────────────────────────────────────────────

// Score a sheet name by geographic granularity.
// Precinct-level > County-level > Group/method breakdown > Statewide totals.
function sheetPriority(name) {
  const n = name.toLowerCase()
  if (n.includes('precinct'))                       return 4
  if (n.includes('county'))                         return 3
  if (n.includes('group') || n.includes('method'))  return 2
  return 1
}

async function readExcel(file) {
  const buffer   = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

  // Pick the most geographically granular sheet available.
  // For Georgia SOS exports: "Precinct Results" > "County Results" > "Total Votes by Group" > "Total Votes"
  const sheetName = workbook.SheetNames.reduce(
    (best, name) => sheetPriority(name) > sheetPriority(best) ? name : best,
    workbook.SheetNames[0],
  )

  const sheet = workbook.Sheets[sheetName]
  const rows  = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false })

  if (!rows.length) throw new Error(`Excel file "${file.name}" appears empty (sheet: ${sheetName})`)
  return rows
}

// ─── CSV import ───────────────────────────────────────────────────────────────

async function readCSV(fileOrText) {
  return new Promise((resolve, reject) => {
    const opts = {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h?.trim(),
      complete: r => resolve(r.data),
      error:   reject,
    }
    if (typeof fileOrText === 'string') {
      Papa.parse(fileOrText, opts)
    } else {
      Papa.parse(fileOrText, opts)
    }
  })
}

// ─── JSON import ──────────────────────────────────────────────────────────────

function readJSON(text) {
  const raw = typeof text === 'string' ? JSON.parse(text) : text
  if (Array.isArray(raw)) return raw
  if (raw.records) return raw.records
  if (raw.data) return raw.data
  throw new Error('JSON must be an array or an object with a "records" or "data" key')
}

// ─── Core import function ─────────────────────────────────────────────────────

export async function importFile(file, opts = {}) {
  const fmt    = detectFormat(file)
  const source = opts.source || SOURCE.USER_UPLOAD

  let rawRows
  if (fmt === 'excel') {
    rawRows = await readExcel(file)
  } else if (fmt === 'json') {
    const text = await file.text()
    rawRows    = readJSON(text)
  } else {
    rawRows = await readCSV(file)
  }

  return processRawRows(rawRows, {
    ...opts,
    source,
    sourceFile: file.name,
    format: fmt,
  })
}

export async function importText(text, format, opts = {}) {
  let rawRows
  if (format === 'json') {
    rawRows = readJSON(text)
  } else {
    rawRows = await readCSV(text)
  }
  return processRawRows(rawRows, { ...opts, format, source: opts.source || SOURCE.USER_PASTE })
}

export async function importJSON(data, opts = {}) {
  const rawRows = readJSON(data)
  return processRawRows(rawRows, { ...opts, format: 'json', source: opts.source || SOURCE.USER_PASTE })
}

// ─── Row processor (shared by all import paths) ───────────────────────────────

function processRawRows(rawRows, opts = {}) {
  // Detect which schema fields were found in the source headers
  const firstRow  = rawRows[0] || {}
  const headers   = Array.isArray(firstRow) ? firstRow : Object.keys(firstRow)
  const columnIdx = buildColumnIndex(headers)
  const detectedColumns = Object.keys(columnIdx)

  // Year-from-filename fallback: e.g. "results_2022.csv" → 2022
  let defaultYear = opts.defaultYear || null
  if (!defaultYear && opts.sourceFile) {
    const m = opts.sourceFile.match(/\b(19|20)\d{2}\b/)
    if (m) defaultYear = parseInt(m[0], 10)
  }

  // ElectionType-from-filename fallback: e.g. "2026 primary results.xlsx" → 'Primary'
  let defaultElectionType = opts.electionType || null
  if (!defaultElectionType && opts.sourceFile) {
    const f = opts.sourceFile.toLowerCase()
    if      (f.includes('presidential')) defaultElectionType = 'Presidential Primary'
    else if (f.includes('runoff'))       defaultElectionType = 'Runoff'
    else if (f.includes('special'))      defaultElectionType = 'Special'
    else if (f.includes('general'))      defaultElectionType = 'General'
    else if (f.includes('primary'))      defaultElectionType = 'Primary'
  }

  const normOpts = {
    source:               opts.source         || SOURCE.USER_UPLOAD,
    sourceUrl:            opts.sourceUrl      || MISSING,
    sourceFile:           opts.sourceFile     || MISSING,
    confidence:           opts.confidence     ?? 1.0,
    defaultElectionType,
    defaultOfficialStatus:opts.officialStatus || 'Unofficial',
    defaultYear,
  }

  const normalized = normalizeBatch(rawRows, normOpts)

  // Debug: log one sample record so the schema shape is visible in the console
  if (normalized.length > 0) {
    console.debug('[Pipeline] sample normalized record:', normalized[0])
  }

  const usable     = normalized.filter(isUsableRecord)
  const { valid, invalid, stats, allErrors, allWarnings } = validateBatch(usable)

  const errLog   = buildValidationErrorLog(allErrors)
  const years    = [...new Set(valid.map(r => r.year).filter(y => y !== MISSING))].sort()
  const counties = new Set(valid.map(r => r.county).filter(c => c !== MISSING)).size

  const entry = createAuditEntry({
    action:           opts.action || 'import',
    source:           opts.source || SOURCE.USER_UPLOAD,
    sourceUrl:        opts.sourceUrl || null,
    sourceFile:       opts.sourceFile || null,
    sourceType:       opts.sourceType || opts.source,
    recordCount:      rawRows.length,
    newRecords:       valid.length,
    duplicates:       0,
    rejected:         invalid.length + (normalized.length - usable.length),
    normalizationLog: detectedColumns.map(f => ({ field: f, count: valid.length })),
    validationErrors: errLog,
    changeHistory:    [],
    rawFileInfo:      opts.rawFileInfo || null,
    electionYears:    years,
    counties,
    status:           valid.length > 0 ? 'success' : 'failed',
    error:            valid.length === 0 ? 'No usable records after normalization and validation' : null,
  })
  AuditLog.addEntry(entry)

  return {
    records:         valid,
    rejected:        invalid,
    stats,
    warnings:        allWarnings,
    auditEntryId:    entry.id,
    years,
    counties,
    detectedColumns,
  }
}

// ─── Pipeline manifest (public/data/pipeline-manifest.json) ──────────────────

let manifestCache = null

export async function loadPipelineManifest() {
  try {
    const resp = await fetch('/data/pipeline-manifest.json', { cache: 'no-cache' })
    if (!resp.ok) return null
    manifestCache = await resp.json()
    return manifestCache
  } catch {
    return null
  }
}

export function getManifest() {
  return manifestCache
}

// Load a single pre-fetched election file from public/data/
export async function loadFromManifestEntry(entry) {
  const resp = await fetch(`/data/${entry.file}`, { cache: 'default' })
  if (!resp.ok) throw new Error(`Could not load ${entry.file}: HTTP ${resp.status}`)

  const data  = await resp.json()
  const rows  = Array.isArray(data) ? data : (data.records || [])
  if (!rows.length) throw new Error(`File ${entry.file} contains no records`)

  return processRawRows(rows, {
    action:        'pipeline_fetch',
    source:        entry.source || SOURCE.PIPELINE,
    sourceUrl:     entry.sourceUrl || null,
    sourceFile:    entry.file,
    sourceType:    SOURCE.PIPELINE,
    confidence:    entry.confidence ?? 1.0,
    officialStatus: entry.status || 'Official',
    electionType:  entry.type,
  })
}

// ─── Census data fetch (browser-compatible) ───────────────────────────────────

export async function fetchCensusPopulation(datasetIds, apiKey) {
  const ids = datasetIds || CENSUS_DATASETS.slice(0, 2).map(d => d.id)
  const { records, results, errors } = await fetchAllPopulation(ids, apiKey)

  const ctx = toContextualData(records)

  const entry = createAuditEntry({
    action:      'census_fetch',
    source:      'U.S. Census Bureau API',
    sourceUrl:   'https://api.census.gov/',
    sourceType:  SOURCE.CENSUS_DECENNIAL,
    recordCount: records.length,
    newRecords:  records.length,
    electionYears: ids.map(id => CENSUS_DATASETS.find(d => d.id === id)?.year).filter(Boolean),
    counties:    records.length,
    status:      errors.length === 0 ? 'success' : errors.length < ids.length ? 'partial' : 'failed',
    error:       errors.length > 0 ? errors.map(e => `${e.datasetId}: ${e.error}`).join('; ') : null,
  })
  AuditLog.addEntry(entry)

  return { contextualData: ctx, records, results, errors, auditEntryId: entry.id }
}

// ─── Voter registration CSV import ───────────────────────────────────────────
// Format: county, year, totalRegistered, activeVoters, inactiveVoters
// Source: Georgia SOS voter registration statistics page
// Note: registration data is used ONLY as a turnout denominator.

export async function importRegistrationData(fileOrText, opts = {}) {
  let rawRows
  if (typeof fileOrText === 'string') {
    rawRows = await readCSV(fileOrText)
  } else if (fileOrText instanceof File) {
    const fmt = detectFormat(fileOrText)
    rawRows = fmt === 'excel' ? await readExcel(fileOrText) :
              fmt === 'json'  ? readJSON(await fileOrText.text()) :
              await readCSV(fileOrText)
  } else {
    rawRows = fileOrText
  }

  const ctx = {}
  const errors = []

  for (const row of rawRows) {
    const county = row.county || row.County || row.COUNTY
    const year   = parseInt(row.year || row.Year || row.YEAR, 10)
    if (!county || isNaN(year)) { errors.push({ row, reason: 'Missing county or year' }); continue }

    const key = `${county.toString().trim()}::${year}`
    ctx[key] = {
      county:         county.toString().trim(),
      year,
      totalRegistered: parseInt(row.totalRegistered || row.total_registered || row['Total Registered'] || 0, 10) || null,
      activeVoters:    parseInt(row.activeVoters    || row.active_voters    || row['Active Voters']    || 0, 10) || null,
      inactiveVoters:  parseInt(row.inactiveVoters  || row.inactive_voters  || row['Inactive Voters']  || 0, 10) || null,
      population:      parseInt(row.population      || row.Population       || 0, 10) || null,
      source:          opts.source || SOURCE.VOTER_REG,
      sourceUrl:       opts.sourceUrl || null,
      note: 'Voter registration used only as turnout denominator. Georgia has no party registration.',
    }
  }

  const entry = createAuditEntry({
    action:      'import',
    source:      opts.source || 'Voter Registration Import',
    sourceType:  SOURCE.VOTER_REG,
    recordCount: rawRows.length,
    newRecords:  Object.keys(ctx).length,
    rejected:    errors.length,
    counties:    new Set(Object.values(ctx).map(r => r.county)).size,
    status:      Object.keys(ctx).length > 0 ? 'success' : 'failed',
  })
  AuditLog.addEntry(entry)

  return { contextualData: ctx, errors, auditEntryId: entry.id }
}

// ─── Audit log access ─────────────────────────────────────────────────────────

export { AuditLog }
export { CENSUS_DATASETS }
