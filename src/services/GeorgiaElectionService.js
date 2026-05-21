// Georgia Election Service
// Handles import, normalization, snapshotting, and caching of election data.
// For the full pipeline (bulk fetch, Census, audit log), see src/pipeline/Pipeline.js.

import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { COUNTY_BY_NAME } from '../data/georgiaCounties.js'

const STORAGE_KEY_DATA      = 'ga_election_records'
const STORAGE_KEY_SNAPSHOTS = 'ga_election_snapshots'
const STORAGE_KEY_CONTEXT   = 'ga_contextual_data'

// ─── Normalization ────────────────────────────────────────────────────────────

const OFFICIAL_STATUS = ['Official', 'Unofficial', 'Historical', 'Snapshot']

function toOfficialStatus(raw) {
  if (!raw) return 'Unofficial'
  const u = raw.toString().trim()
  return OFFICIAL_STATUS.find(s => s.toLowerCase() === u.toLowerCase()) || 'Unofficial'
}

function normalizeParty(raw) {
  if (!raw) return 'Unknown'
  const u = raw.toString().toUpperCase().trim()
  if (['REP', 'R', 'REPUBLICAN'].includes(u)) return 'Republican'
  if (['DEM', 'D', 'DEMOCRATIC', 'DEMOCRAT'].includes(u)) return 'Democratic'
  if (['LIB', 'L', 'LIBERTARIAN'].includes(u)) return 'Libertarian'
  if (['NP', 'NON', 'NONPARTISAN'].includes(u)) return 'Nonpartisan'
  return raw.toString().trim()
}

function normalizeVoteMethod(raw) {
  if (!raw) return 'Total'
  const u = raw.toString().toUpperCase().trim()
  if (u.includes('ADVANCE') || u.includes('EARLY')) return 'Early Voting'
  if (u.includes('ABSENTEE') || u.includes('MAIL')) return 'Absentee'
  if (u.includes('ELECTION DAY') || u.includes('ED')) return 'Election Day'
  if (u === 'TOTAL' || u === 'ALL') return 'Total'
  return raw.toString().trim()
}

function resolveCountyFips(countyName) {
  if (!countyName) return null
  const key = countyName.toString().toUpperCase().trim().replace(/\sCOUNTY$/, '')
  return COUNTY_BY_NAME[key]?.fips ?? null
}

function generateId(record) {
  return [record.year, record.county, record.office, record.candidate, record.voteMethod]
    .join('-')
    .replace(/\s+/g, '_')
    .slice(0, 80)
}

// Map CSV column aliases to normalized field names.
// Includes Clarity Elections CSV headers (e.g. "Contest Name", "Choice",
// "Advance Voting Votes", "Absentee by Mail Votes") and SOS statewide summary
// headers (e.g. "Advance", "Absentee", "Total").
const COLUMN_MAP = {
  year:             ['year', 'election_year', 'electionyear', 'yr', 'cycle', 'elec_year'],
  electionDate:     ['election_date', 'electiondate', 'date', 'contest_date', 'elec_date'],
  electionType:     ['election_type', 'electiontype', 'type', 'race_type', 'contest_type'],

  // Clarity CSV: "County Name"
  county:           ['county', 'county_name', 'countyname', 'jurisdiction',
                     'jurisdiction_name', 'county_desc', 'reporting_county'],

  // Clarity CSV: "Precinct Name" / Enhanced Voting: "Reporting Unit"
  precinct:         ['precinct', 'precinct_name', 'precinctname',
                     'reporting_unit', 'reporting_unit_name', 'ward'],

  district:         ['district', 'district_name', 'cd', 'congressional_district'],

  // Clarity CSV: "Contest Name"
  office:           ['office', 'race', 'contest', 'office_name', 'office_title',
                     'contest_name', 'contest_title', 'race_name', 'ballot_title'],

  // Clarity CSV: "Choice"
  candidate:        ['candidate', 'candidate_name', 'candidatename', 'name',
                     'choice', 'choice_name', 'person_name'],

  candidateParty:   ['party', 'candidate_party', 'candidateparty', 'party_name',
                     'party_code', 'affiliation'],

  // SOS statewide summary: "Primary Type"
  ballotType:       ['ballot_type', 'ballottype', 'primary_type', 'primary_party', 'ballot_party'],

  // Clarity CSV: "Total Votes"; SOS summary: "Total"
  votes:            ['votes', 'total_votes', 'totalvotes', 'vote_count',
                     'total', 'ballots_cast', 'total_ballots', 'ballots', 'num_votes'],

  // Clarity CSV: "Election Day Votes"
  electionDayVotes: ['election_day_votes', 'electiondayvotes', 'ed_votes',
                     'election_day', 'e_day_votes', 'election_night_votes'],

  // Clarity CSV: "Advance Voting Votes"; SOS summary: "Advance"
  earlyVotes:       ['early_votes', 'advance_votes', 'advancevotes', 'early_voting_votes',
                     'advance_voting_votes', 'advance', 'in_person_early', 'ev_votes'],

  // Clarity CSV: "Absentee by Mail Votes"; SOS summary: "Absentee"
  absenteeVotes:    ['absentee_votes', 'absenteevotes', 'abs_votes', 'mail_votes',
                     'absentee_by_mail_votes', 'absentee_by_mail', 'absentee',
                     'mail_in_votes', 'vote_by_mail', 'absentee_mail'],

  provisionalVotes: ['provisional_votes', 'provisionalvotes', 'prov_votes', 'provisional'],

  registeredVoters: ['registered_voters', 'registeredvoters', 'reg_voters',
                     'active_voters', 'total_registered'],

  officialStatus:   ['official_status', 'officialstatus', 'status', 'results_type'],
}

function buildColumnIndex(headers) {
  const idx = {}
  const lc = headers.map(h => h?.toLowerCase().trim().replace(/\s+/g, '_'))
  for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
    for (const alias of aliases) {
      const col = lc.indexOf(alias)
      if (col !== -1) { idx[field] = col; break }
    }
  }
  return idx
}

function mapRow(row, idx) {
  const g = (field) => {
    const col = idx[field]
    if (col == null) return undefined
    return Array.isArray(row) ? row[col] : Object.values(row)[col]
  }

  const gByName = (field) => {
    if (!Array.isArray(row)) {
      const aliases = COLUMN_MAP[field] || []
      for (const alias of aliases) {
        if (row[alias] != null) return row[alias]
        // Try camelCase variant
        const camel = alias.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
        if (row[camel] != null) return row[camel]
      }
    }
    return g(field)
  }

  const raw = {
    year:            gByName('year'),
    electionDate:    gByName('electionDate'),
    electionType:    gByName('electionType'),
    county:          gByName('county'),
    precinct:        gByName('precinct'),
    district:        gByName('district'),
    office:          gByName('office'),
    candidate:       gByName('candidate'),
    candidateParty:  gByName('candidateParty'),
    ballotType:      gByName('ballotType'),
    voteMethod:      gByName('voteMethod'),
    votes:           gByName('votes'),
    electionDayVotes:gByName('electionDayVotes'),
    earlyVotes:      gByName('earlyVotes'),
    absenteeVotes:   gByName('absenteeVotes'),
    registeredVoters:gByName('registeredVoters'),
    officialStatus:  gByName('officialStatus'),
  }

  const countyName = raw.county?.toString().trim()
  const fips = resolveCountyFips(countyName)
  const party = normalizeParty(raw.candidateParty || raw.ballotType)
  const yearNum = parseInt(raw.year, 10) || new Date(raw.electionDate).getFullYear()

  const normalized = {
    year:             yearNum,
    electionDate:     raw.electionDate || `${yearNum}-01-01`,
    electionType:     raw.electionType || 'Primary',
    office:           raw.office?.toString().trim() || 'Unknown',
    district:         raw.district?.toString().trim() || 'Statewide',
    county:           countyName || 'Unknown',
    fips,
    precinct:         raw.precinct?.toString().trim() || null,
    candidate:        raw.candidate?.toString().trim() || null,
    candidateParty:   party,
    voteMethod:       normalizeVoteMethod(raw.voteMethod),
    ballotType:       party,
    votes:            parseInt(raw.votes, 10) || 0,
    electionDayVotes: parseInt(raw.electionDayVotes, 10) || 0,
    earlyVotes:       parseInt(raw.earlyVotes, 10) || 0,
    absenteeVotes:    parseInt(raw.absenteeVotes, 10) || 0,
    registeredVoters: parseInt(raw.registeredVoters, 10) || 0,
    source:           'User Import',
    sourceDate:       new Date().toISOString().slice(0, 10),
    officialStatus:   toOfficialStatus(raw.officialStatus),
    comparableType:   yearNum % 4 === 0 ? 'Presidential' : 'Midterm',
  }
  normalized.id = generateId(normalized)
  return normalized
}

// ─── CSV Import ───────────────────────────────────────────────────────────────

export async function importCSV(fileOrText) {
  return new Promise((resolve, reject) => {
    const opts = {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h?.trim(),
      complete: (result) => {
        try {
          const headers = Object.keys(result.data[0] || {})
          const idx = buildColumnIndex(headers)
          const records = result.data
            .filter(r => Object.values(r).some(v => v))
            .map(r => mapRow(r, idx))
            .filter(r => r.votes >= 0 && r.county !== 'Unknown')
          resolve({ records, errors: result.errors })
        } catch (e) {
          reject(e)
        }
      },
      error: reject,
    }

    if (typeof fileOrText === 'string') {
      Papa.parse(fileOrText, opts)
    } else {
      Papa.parse(fileOrText, opts)
    }
  })
}

// ─── JSON Import ──────────────────────────────────────────────────────────────

export function importJSON(data) {
  const raw = typeof data === 'string' ? JSON.parse(data) : data
  const arr = Array.isArray(raw) ? raw : raw.records || raw.data || []
  const headers = arr.length ? Object.keys(arr[0]) : []
  const idx = buildColumnIndex(headers)
  return arr.map(r => mapRow(r, idx)).filter(r => r.votes >= 0)
}

// ─── Excel Import ─────────────────────────────────────────────────────────────

async function importExcel(file) {
  const buffer   = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  const sheet    = workbook.Sheets[sheetName]
  const rows     = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false })
  if (!rows.length) throw new Error(`Excel file "${file.name}" appears empty (sheet: ${sheetName})`)

  const headers = Object.keys(rows[0])
  const idx = buildColumnIndex(headers)
  const records = rows
    .filter(r => Object.values(r).some(v => v != null && v !== ''))
    .map(r => mapRow(r, idx))
    .filter(r => r.votes >= 0 && r.county !== 'Unknown')
  return { records, errors: [] }
}

// ─── File Import (auto-detects format) ───────────────────────────────────────

export async function importFile(file) {
  const ext  = file.name.split('.').pop().toLowerCase()
  const type = file.type.toLowerCase()

  if (ext === 'xlsx' || ext === 'xls' || type.includes('spreadsheet') || type.includes('excel')) {
    return importExcel(file)
  }
  if (ext === 'json' || type.includes('json')) {
    const text = await file.text()
    const records = importJSON(text)
    return { records, errors: [] }
  }
  return importCSV(file)
}

// ─── Snapshot Management ──────────────────────────────────────────────────────

export function createSnapshot({ records, label, source, officialStatus }) {
  const snapshot = {
    id: `snapshot-${Date.now()}`,
    label: label || `Import — ${new Date().toLocaleString()}`,
    importedAt: new Date().toISOString(),
    source: source || 'User Import',
    recordCount: records.length,
    officialStatus: officialStatus || 'Unofficial',
    yearRange: (() => {
      const years = [...new Set(records.map(r => r.year))].sort()
      return years.length ? `${years[0]}–${years[years.length - 1]}` : 'Unknown'
    })(),
  }
  return snapshot
}

// ─── Local Persistence ────────────────────────────────────────────────────────

export const Cache = {
  getRecords() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_DATA) || '[]') }
    catch { return [] }
  },

  saveRecords(records) {
    try { localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(records)) }
    catch (e) { console.warn('Storage quota exceeded — skipping cache', e) }
  },

  getSnapshots() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_SNAPSHOTS) || '[]') }
    catch { return [] }
  },

  saveSnapshots(snapshots) {
    try { localStorage.setItem(STORAGE_KEY_SNAPSHOTS, JSON.stringify(snapshots)) }
    catch { /* quota */ }
  },

  getContextualData() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_CONTEXT) || '{}') }
    catch { return {} }
  },

  saveContextualData(data) {
    try { localStorage.setItem(STORAGE_KEY_CONTEXT, JSON.stringify(data)) }
    catch { /* quota */ }
  },

  clear() {
    localStorage.removeItem(STORAGE_KEY_DATA)
    localStorage.removeItem(STORAGE_KEY_SNAPSHOTS)
    localStorage.removeItem(STORAGE_KEY_CONTEXT)
  },
}

// ─── Data Discovery ───────────────────────────────────────────────────────────
// All dynamic discovery — never hardcodes years/counties/offices

export function discoverDimensions(records) {
  const years    = [...new Set(records.map(r => r.year))].sort()
  const counties = [...new Set(records.map(r => r.county))].filter(Boolean).sort()
  const offices  = [...new Set(records.filter(r => r.office !== 'BALLOT_TOTALS').map(r => r.office))].sort()
  const types    = [...new Set(records.map(r => r.electionType))].sort()
  const methods  = [...new Set(records.map(r => r.voteMethod))].filter(Boolean).sort()
  const cycles   = [...new Set(records.map(r => `${r.year}|${r.electionType}`))].sort()

  const cycleMeta = cycles.map(c => {
    const [year, type] = c.split('|')
    return { year: parseInt(year), type, key: c }
  })

  return { years, counties, offices, types, methods, cycles: cycleMeta }
}

// ─── Contextual Data Import (voter rolls, population, etc.) ──────────────────

export function importContextualData(rawData) {
  // Contextual data: registered voters, active/inactive, population
  // NEVER used as party affiliation — only as turnout denominator
  const normalized = {}
  const arr = Array.isArray(rawData) ? rawData : [rawData]
  for (const row of arr) {
    const county = row.county?.toString().trim()
    const year   = parseInt(row.year, 10)
    if (!county || !year) continue
    const key = `${county}::${year}`
    normalized[key] = {
      county,
      year,
      totalRegistered: parseInt(row.totalRegistered || row.registered_voters || 0, 10),
      activeVoters:    parseInt(row.activeVoters    || row.active_voters    || 0, 10),
      inactiveVoters:  parseInt(row.inactiveVoters  || row.inactive_voters  || 0, 10),
      population:      parseInt(row.population      || 0, 10),
      note: 'Voter registration is used only as a turnout denominator. Georgia has no party registration.',
    }
  }
  return normalized
}
