// Pipeline schema — field definitions, MISSING sentinel, source constants
// MISSING_DATA is the canonical label for any field absent from source.
// It is never null, never 0, never estimated.

export const MISSING = 'MISSING_DATA'
export const isMissing = (v) => v === MISSING || v == null || v === '' || v === undefined

// Display label for UI components
export const missingLabel = '—'

// Field specifications — drives validation and UI display
export const FIELD_SPEC = {
  // year and electionType are NOT required — many SOS exports omit both columns.
  // year falls back to: electionDate column → opts.defaultYear → filename regex.
  // electionType falls back to: opts.electionType → filename keyword.
  year:             { type: 'integer', required: false, label: 'Election Year', min: 1990, max: 2100 },
  electionDate:     { type: 'date',    required: false, label: 'Election Date' },
  electionType:     { type: 'enum',    required: false, label: 'Election Type',
                      values: ['Primary', 'General', 'Runoff', 'Special', 'Presidential Primary'] },
  // county is NOT required — precinct-level exports may omit the county column.
  county:           { type: 'string',  required: false, label: 'County' },
  precinct:         { type: 'string',  required: false, label: 'Precinct' },
  district:         { type: 'string',  required: false, label: 'District' },
  fips:             { type: 'string',  required: false, label: 'FIPS Code' },
  office:           { type: 'string',  required: true,  label: 'Office / Race' },
  candidate:        { type: 'string',  required: false, label: 'Candidate Name' },
  candidateParty:   { type: 'string',  required: false, label: 'Candidate Party' },
  ballotType:       { type: 'string',  required: false, label: 'Primary Ballot Type' },
  voteMethod:       { type: 'enum',    required: false, label: 'Vote Method',
                      values: ['Total', 'Election Day', 'Early Voting', 'Absentee', 'Provisional'] },
  votes:            { type: 'integer', required: true,  label: 'Total Votes', min: 0 },
  electionDayVotes: { type: 'integer', required: false, label: 'Election Day Votes', min: 0 },
  earlyVotes:       { type: 'integer', required: false, label: 'Early Voting Votes', min: 0 },
  absenteeVotes:    { type: 'integer', required: false, label: 'Absentee Votes', min: 0 },
  provisionalVotes: { type: 'integer', required: false, label: 'Provisional Votes', min: 0 },
  registeredVoters: { type: 'integer', required: false, label: 'Registered Voters', min: 0 },
  contestStatus:    { type: 'string',  required: false, label: 'Contest Status' },
  officialStatus:   { type: 'enum',    required: false, label: 'Official Status',
                      values: ['Official', 'Unofficial', 'Historical', 'Certified', 'Snapshot'] },
  source:           { type: 'string',  required: true,  label: 'Data Source' },
  sourceUrl:        { type: 'string',  required: false, label: 'Source URL' },
  sourceFile:       { type: 'string',  required: false, label: 'Source Filename' },
  confidence:       { type: 'float',   required: false, label: 'Data Confidence', min: 0, max: 1 },
  comparableType:   { type: 'string',  required: false, label: 'Comparable Cycle Type' },
}

// Canonical source type identifiers
export const SOURCE = {
  CLARITY:          'Georgia SOS / Clarity Elections',
  SOS_LEGACY:       'Georgia SOS (Legacy Export)',
  SOS_DIRECT:       'Georgia SOS (Direct Download)',
  CENSUS_ACS:       'U.S. Census ACS 5-Year',
  CENSUS_DECENNIAL: 'U.S. Census Decennial',
  VOTER_REG:        'Georgia SOS Voter Registration',
  USER_UPLOAD:      'User Upload',
  USER_PASTE:       'User Paste',
  PIPELINE:         'Automated Pipeline',
}

// Election type canonical names and known aliases
export const ELECTION_TYPE_ALIASES = {
  'presidential primary':           'Presidential Primary',
  'presidential preference primary': 'Presidential Primary',
  'presidential pref primary':      'Presidential Primary',
  'ppp':                            'Presidential Primary',
  'pres primary':                   'Presidential Primary',
  'primary':                        'Primary',
  'state primary':                  'Primary',
  'general primary':                'Primary',
  'gp':                             'Primary',
  'general':                        'General',
  'general election':               'General',
  'ge':                             'General',
  'runoff':                         'Runoff',
  'primary runoff':                 'Runoff',
  'general runoff':                 'Runoff',
  'special':                        'Special',
  'special election':               'Special',
  'special primary':                'Special',
  'special runoff':                 'Special',
}

// Comparable cycle matching (presidential vs. midterm vs. special)
export function detectComparableType(year, electionType) {
  if (!year || !electionType) return MISSING
  const t = electionType.toLowerCase()
  if (t.includes('special')) return 'Special'
  if (t.includes('runoff'))  return 'Runoff'
  if (t.includes('presidential')) return 'Presidential'
  return year % 4 === 0 ? 'Presidential' : 'Midterm'
}

// Official status normalization
export const OFFICIAL_STATUS_ALIASES = {
  'official':    'Official',
  'certified':   'Official',
  'cert':        'Official',
  'unofficial':  'Unofficial',
  'preliminary': 'Unofficial',
  'historical':  'Historical',
  'hist':        'Historical',
  'snapshot':    'Snapshot',
  'snap':        'Snapshot',
}

// Storage keys
export const STORAGE_KEYS = {
  RECORDS:   'ga_election_records',
  SNAPSHOTS: 'ga_election_snapshots',
  CONTEXT:   'ga_contextual_data',
  AUDIT_LOG: 'ga_pipeline_audit_log',
  MANIFEST:  'ga_pipeline_manifest',
}
