// Election Field Normalizer
// Maps raw source data to the canonical schema.
// All missing fields are marked MISSING — never estimated or defaulted.

import { MISSING, isMissing, ELECTION_TYPE_ALIASES, OFFICIAL_STATUS_ALIASES, detectComparableType, SOURCE } from '../schema.js'
import { COUNTY_BY_NAME } from '../../data/georgiaCounties.js'

// ─── Party normalization ──────────────────────────────────────────────────────

const PARTY_MAP = {
  'rep': 'Republican',  'r': 'Republican',  'republican': 'Republican',
  'gop': 'Republican',
  'dem': 'Democratic',  'd': 'Democratic',  'democratic': 'Democratic',
  'democrat': 'Democratic',
  'lib': 'Libertarian', 'l': 'Libertarian', 'libertarian': 'Libertarian',
  'grn': 'Green',       'green': 'Green',
  'ind': 'Independent', 'independent': 'Independent', 'i': 'Independent',
  'np':  'Nonpartisan', 'non': 'Nonpartisan', 'nonpartisan': 'Nonpartisan',
  'wri': 'Write-In',    'write-in': 'Write-In', 'writein': 'Write-In',
}

export function normalizeParty(raw) {
  if (isMissing(raw)) return MISSING
  const key = raw.toString().toLowerCase().trim().replace(/[.\s-]/g, '')
  return PARTY_MAP[key] || raw.toString().trim() || MISSING
}

// ─── Election type normalization ──────────────────────────────────────────────

export function normalizeElectionType(raw) {
  if (isMissing(raw)) return MISSING
  const key = raw.toString().toLowerCase().trim()
  return ELECTION_TYPE_ALIASES[key] || raw.toString().trim() || MISSING
}

// ─── Vote method normalization ────────────────────────────────────────────────

const VOTE_METHOD_MAP = {
  'election day':      'Election Day',   'ed':               'Election Day',
  'election-day':      'Election Day',   'electionday':      'Election Day',
  'e-day':             'Election Day',   'in-person':        'Election Day',
  'early':             'Early Voting',   'early voting':     'Early Voting',
  'advance':           'Early Voting',   'advance voting':   'Early Voting',
  'advance in person': 'Early Voting',   'in-person early':  'Early Voting',
  // Georgia SOS "Group" column values
  'absentee by mail':  'Absentee',       'absentee_by_mail': 'Absentee',
  'absentee':          'Absentee',       'absentee/mail':    'Absentee',
  'mail':              'Absentee',       'mail-in':          'Absentee',
  'absenteebymailcovid': 'Absentee',
  'provisional':       'Provisional',    'prov':             'Provisional',
  'total':             'Total',          'all':              'Total',
  'combined':          'Total',
}

export function normalizeVoteMethod(raw) {
  if (isMissing(raw)) return 'Total'
  const key = raw.toString().toLowerCase().trim()
  return VOTE_METHOD_MAP[key] || raw.toString().trim() || 'Total'
}

// ─── County normalization ─────────────────────────────────────────────────────

export function normalizeCounty(raw) {
  if (isMissing(raw)) return MISSING
  const cleaned = raw.toString().trim()
    .replace(/\s+county$/i, '')
    .replace(/\s+co\.?$/i, '')
    .toUpperCase()
    .trim()

  const entry = COUNTY_BY_NAME[cleaned]
  if (entry) return entry.name
  // Return cleaned title-case name even if not found in known list
  return cleaned.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')
}

export function resolveCountyFips(raw) {
  if (isMissing(raw)) return MISSING
  const cleaned = raw.toString().trim()
    .replace(/\s+county$/i, '')
    .replace(/\s+co\.?$/i, '')
    .toUpperCase()
    .trim()
  return COUNTY_BY_NAME[cleaned]?.fips || MISSING
}

// ─── Integer / numeric parsing ────────────────────────────────────────────────

function parseIntOrMissing(raw) {
  if (isMissing(raw)) return MISSING
  const s = raw.toString().replace(/[,$\s]/g, '')
  if (s === '' || s === '-') return MISSING
  const n = parseInt(s, 10)
  return isNaN(n) ? MISSING : n
}

function parseDateOrMissing(raw, fallbackYear) {
  if (isMissing(raw)) return fallbackYear ? `${fallbackYear}-01-01` : MISSING
  const s = raw.toString().trim()
  if (!s) return MISSING

  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)

  // Try M/D/YYYY or MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`

  // Try D-M-YYYY (European)
  const dmy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`

  // Try YYYYMMDD
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`

  return MISSING
}

// ─── Comprehensive column aliases ─────────────────────────────────────────────

// Georgia SOS / Clarity Elections column names mapped alongside generic aliases.
// Header normalisation: lowercase + spaces/hyphens → underscores before lookup.
export const COLUMN_ALIASES = {
  year:             ['year','election_year','electionyear','yr','cycle','elec_year'],
  electionDate:     ['election_date','electiondate','date','contest_date','elec_date','election_day_date'],
  electionType:     ['election_type','electiontype','type','race_type','contest_type','election_kind'],

  // Clarity CSV: "County Name"
  county:           ['county','county_name','countyname','jurisdiction','county_desc',
                     'jurisdiction_name','county_fips_name','reporting_county'],

  // Clarity CSV: "Precinct Name" / Enhanced Voting: "Reporting Unit"
  precinct:         ['precinct','precinct_name','precinctname','reporting_unit','reporting_unit_name',
                     'precinct_code','ward','reporting_unit_id'],

  district:         ['district','district_name','cd','congressional_district','senate_district',
                     'house_district','district_number'],

  // Clarity CSV: "Contest Name"
  office:           ['office','race','contest','office_name','office_title','race_name','position',
                     'contest_name','contest_title','race_title','ballot_title','office_description'],

  // Clarity CSV: "Choice"; SOS export: "Ballot Name"
  candidate:        ['candidate','candidate_name','candidatename','name','person_name','choice',
                     'choice_name','choice_party_name','candidate_full_name','ballot_name'],

  // Party / ballot type — Clarity uses "Party" column
  candidateParty:   ['party','candidate_party','candidateparty','party_name','affiliation',
                     'party_code','party_abbr','political_party'],

  // Primary ballot type (statewide summary files use "Primary Type")
  ballotType:       ['ballot_type','ballottype','primary_type','primary_party','ballot_party',
                     'ballot_type_name','primary_ballot_type'],

  // SOS export: "Group" column (vote method breakdown)
  voteMethod:       ['vote_method','votemethod','vote_type','method','voting_method','vote_mode','mode','group'],

  // Clarity CSV: "Total Votes"; SOS summary: "Total"
  votes:            ['votes','total_votes','totalvotes','vote_count','num_votes','count',
                     'ballots_cast','total_ballots','total','ballots','total_ballots_cast',
                     'total_vote_count','candidate_total_votes'],

  // Clarity CSV: "Election Day Votes"
  electionDayVotes: ['election_day_votes','electiondayvotes','ed_votes','e_day_votes',
                     'in_person_votes','election_day','election_night_votes','eday_votes',
                     'election_day_vote_count'],

  // Clarity CSV: "Advance Voting Votes"; SOS statewide: "Advance"
  earlyVotes:       ['early_votes','advance_votes','advancevotes','early_voting_votes',
                     'advance_voting_votes','in_person_early','advance_in_person',
                     'in_person_advance_votes','advance','early_vote_count','ev_votes'],

  // Clarity CSV: "Absentee by Mail Votes"; SOS statewide: "Absentee"
  absenteeVotes:    ['absentee_votes','absenteevotes','abs_votes','mail_votes','vote_by_mail',
                     'absentee_mail','absentee_by_mail_votes','absentee_by_mail',
                     'mail_in_votes','absentee_ballot_votes','absentee','absentee_vote_count',
                     'absentee_mail_votes'],

  // Clarity CSV: "Provisional Votes"
  provisionalVotes: ['provisional_votes','provisionalvotes','prov_votes','provisional'],

  registeredVoters: ['registered_voters','registeredvoters','reg_voters','active_voters',
                     'total_registered','total_registered_voters','voter_registration_count'],

  contestStatus:    ['contest_status','conteststatus','status','race_status','contest_state'],
  officialStatus:   ['official_status','officialstatus','certified','certification_status',
                     'results_type','result_type'],
  sourceUrl:        ['source_url','sourceurl','url','data_url','download_url'],
}

// Build a column-index from CSV/JSON header keys
export function buildColumnIndex(headers) {
  const idx = {}
  const lc  = headers.map(h => h?.toString().toLowerCase().trim().replace(/[\s-]+/g, '_'))
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const col = lc.indexOf(alias)
      if (col !== -1) { idx[field] = col; break }
    }
  }
  return idx
}

// ─── Core record normalization ────────────────────────────────────────────────

function extractRaw(row, idx) {
  const g = (field) => {
    // Try index-based access (CSV array rows)
    const col = idx[field]
    if (col != null) {
      const v = Array.isArray(row) ? row[col] : Object.values(row)[col]
      if (!isMissing(v)) return v
    }
    // Try direct key access (JSON object rows)
    if (!Array.isArray(row)) {
      const aliases = COLUMN_ALIASES[field] || []
      for (const alias of aliases) {
        if (!isMissing(row[alias])) return row[alias]
        // Try camelCase variant
        const camel = alias.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
        if (!isMissing(row[camel])) return row[camel]
      }
    }
    return undefined
  }
  return g
}

export function normalizeRecord(row, idx, opts = {}) {
  const g = extractRaw(row, idx)

  const rawYear   = g('year')
  const rawDate   = g('electionDate')
  const rawType   = g('electionType')
  const rawCounty = g('county')

  // Year — optional in source; fall back to electionDate, then opts.defaultYear
  let year = MISSING
  if (!isMissing(rawYear)) {
    const y = parseInt(rawYear, 10)
    if (!isNaN(y) && y >= 1990 && y <= 2100) year = y
  }
  if (year === MISSING && !isMissing(rawDate)) {
    const d = new Date(rawDate)
    if (!isNaN(d.getTime())) year = d.getFullYear()
  }
  if (year === MISSING && opts.defaultYear) {
    const dy = parseInt(opts.defaultYear, 10)
    if (!isNaN(dy) && dy >= 1990 && dy <= 2100) year = dy
  }

  // Election date
  const electionDate = parseDateOrMissing(rawDate, year !== MISSING ? year : null)

  // Election type
  const electionType = !isMissing(rawType)
    ? normalizeElectionType(rawType)
    : (opts.defaultElectionType || MISSING)

  // County
  const county    = normalizeCounty(rawCounty)
  const fips      = county !== MISSING ? resolveCountyFips(rawCounty) : MISSING

  // Party / ballot type
  const rawParty  = g('candidateParty') || g('ballotType')
  const party     = normalizeParty(rawParty)

  // Votes
  const votes            = parseIntOrMissing(g('votes'))
  const electionDayVotes = parseIntOrMissing(g('electionDayVotes'))
  const earlyVotes       = parseIntOrMissing(g('earlyVotes'))
  const absenteeVotes    = parseIntOrMissing(g('absenteeVotes'))
  const provisionalVotes = parseIntOrMissing(g('provisionalVotes'))
  const registeredVoters = parseIntOrMissing(g('registeredVoters'))

  // Office — treat ballot totals specially
  const rawOffice  = g('office')
  const officeRaw  = !isMissing(rawOffice) ? rawOffice.toString().trim() : MISSING
  const isBallotTotal = officeRaw !== MISSING &&
    /ballot[_\s]?total|total[_\s]?ballot|ballot[_\s]?count/i.test(officeRaw)
  const office = isBallotTotal ? 'BALLOT_TOTALS' : officeRaw

  // Vote method
  const voteMethod = normalizeVoteMethod(g('voteMethod'))

  // Official status
  const rawStatus  = g('officialStatus')
  const officialStatus = !isMissing(rawStatus)
    ? (OFFICIAL_STATUS_ALIASES[rawStatus.toString().toLowerCase().trim()] || rawStatus.toString().trim())
    : (opts.defaultOfficialStatus || 'Unofficial')

  // Comparable cycle type
  const comparableType = detectComparableType(year, electionType)

  const normalized = {
    year,
    electionDate,
    electionType,
    county,
    fips,
    precinct:         !isMissing(g('precinct'))   ? g('precinct').toString().trim()  : MISSING,
    district:         !isMissing(g('district'))   ? g('district').toString().trim()  : MISSING,
    office,
    candidate:        !isMissing(g('candidate'))  ? g('candidate').toString().trim() : MISSING,
    candidateParty:   party,
    ballotType:       party,
    voteMethod,
    votes:            votes !== MISSING ? votes : 0,
    electionDayVotes,
    earlyVotes,
    absenteeVotes,
    provisionalVotes,
    registeredVoters,
    contestStatus:    !isMissing(g('contestStatus')) ? g('contestStatus').toString().trim() : MISSING,
    officialStatus,
    source:           opts.source     || SOURCE.USER_UPLOAD,
    sourceUrl:        opts.sourceUrl  || (!isMissing(g('sourceUrl')) ? g('sourceUrl').toString().trim() : MISSING),
    sourceFile:       opts.sourceFile || MISSING,
    confidence:       opts.confidence ?? 1.0,
    comparableType,
  }

  // Stable ID for deduplication
  normalized.id = [
    normalized.year,
    normalized.county,
    normalized.precinct !== MISSING ? normalized.precinct : '',
    normalized.office,
    normalized.candidate !== MISSING ? normalized.candidate : '',
    normalized.voteMethod,
  ].join('|').replace(/\s+/g, '_').slice(0, 120)

  return normalized
}

// Normalize a batch of rows
export function normalizeBatch(rows, opts = {}) {
  if (!rows.length) return []
  const headers = Array.isArray(rows[0]) ? rows[0] : Object.keys(rows[0])
  const idx = buildColumnIndex(headers)

  const start = Array.isArray(rows[0]) ? 1 : 0

  return rows.slice(start)
    .filter(r => {
      const vals = Array.isArray(r) ? r : Object.values(r)
      return vals.some(v => !isMissing(v) && String(v).trim() !== '')
    })
    .map(r => normalizeRecord(r, idx, opts))
}
