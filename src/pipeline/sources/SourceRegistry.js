// Source Registry — catalog of all data sources with verified access status.
// Statuses are set based on live access verification, not assumptions.

export const ACCESS = {
  AUTOMATED:  'automated',   // Can be fetched programmatically without a browser
  MANUAL:     'manual',      // Requires human to open a browser, download, then upload
  BLOCKED:    'blocked',     // Previously accessible; currently returning 403 or requires JS challenge
  UNKNOWN:    'unknown',     // Not yet verified
}

// ─── Georgia SOS — Election Results ──────────────────────────────────────────

export const SOS_PORTAL = {
  id:          'sos-enhanced-voting',
  name:        'Georgia SOS Election Results Portal',
  access:      ACCESS.MANUAL,
  baseUrl:     'https://results.sos.ga.gov/results/public/Georgia',
  description: 'Current Georgia election results. Angular SPA backed by Enhanced Voting. ' +
               'Requires a browser session. No accessible REST API found.',
  downloadSteps: [
    'Open the election in a browser at results.sos.ga.gov',
    'Navigate to the election you want (e.g. "2024 General Primary")',
    'Use the export / download option in the top-right of the results page (if available)',
    'Or use the "Media Export" link if present — it downloads a CSV or Excel file',
    'Upload the downloaded file using the Upload tab in this dashboard',
  ],
  note: 'The Clarity Elections API (results.enr.clarityelections.com) that previously ' +
        'served machine-readable data is blocked for automated access as of 2025 (HTTP 403). ' +
        'Georgia SOS migrated to the Enhanced Voting platform with named election IDs.',
  knownElections: [
    { label: '2024 General Primary',    url: 'https://results.sos.ga.gov/results/public/Georgia/elections/GeneralPrimary51926' },
    { label: '2022 General Election',   url: 'https://results.sos.ga.gov/results/public/Georgia/elections/' },
    { label: '2022 General Primary',    url: 'https://results.sos.ga.gov/results/public/Georgia/elections/' },
  ],
}

export const SOS_VOTER_REG = {
  id:          'sos-voter-registration',
  name:        'Georgia SOS Voter Registration Statistics',
  access:      ACCESS.MANUAL,
  baseUrl:     'https://elections.sos.ga.gov/Elections/voterregistrationstats.do',
  description: 'County-level voter registration totals by status. ' +
               'Used only as a turnout denominator — Georgia has no party registration.',
  downloadSteps: [
    'Navigate to elections.sos.ga.gov/Elections/voterregistrationstats.do',
    'Select the election or reporting date',
    'Download the Excel or CSV export',
    'Upload using the Voter / Census Context tab',
  ],
  requiredColumns: ['county', 'year', 'totalRegistered', 'activeVoters', 'inactiveVoters'],
  note: 'Georgia is a non-partisan registration state. Registration counts carry no ' +
        'party affiliation and are used only as a denominator in turnout calculations.',
}

export const SOS_DATA_HUB = {
  id:          'sos-data-hub',
  name:        'Georgia SOS Election Data Hub',
  access:      ACCESS.MANUAL,
  baseUrl:     'https://sos.ga.gov',
  description: 'Post-election data exports published by the SOS office. ' +
               'Includes county-level and precinct-level breakdowns for major elections.',
  downloadSteps: [
    'Go to sos.ga.gov and search for "data hub" + the election name',
    'Example: "Data Hub November 8, 2022 General Election"',
    'The page contains direct download links for county and precinct files',
    'Note: these pages are behind Cloudflare and require a real browser session',
    'Download the files and upload using the Upload tab',
  ],
  note: 'Pages load in browser but cannot be fetched with curl/Node.js (Cloudflare Bot Management). ' +
        'Download manually and upload to this dashboard.',
  examplePages: [
    'sos.ga.gov/page/data-hub-november-8-2022-general-election',
    'sos.ga.gov/page/data-hub-december-6-2022-runoff',
  ],
}

// ─── Clarity Elections (Legacy / Blocked) ────────────────────────────────────

export const CLARITY_ELECTIONS = {
  id:          'clarity-elections',
  name:        'Clarity Elections API (Legacy)',
  access:      ACCESS.BLOCKED,
  baseUrl:     'https://results.enr.clarityelections.com/GA',
  description: 'Former Georgia SOS results backend. Served machine-readable JSON and CSV. ' +
               'All requests now return HTTP 403 (Cloudflare Bot Management).',
  verificationDate: '2025-05-20',
  verificationNote: 'Verified: all Clarity IDs tested return 403 from nginx. ' +
                    'Georgia SOS has migrated to the Enhanced Voting platform.',
}

// ─── U.S. Census Bureau ───────────────────────────────────────────────────────

export const CENSUS_API = {
  id:          'census-api',
  name:        'U.S. Census Bureau API',
  access:      ACCESS.AUTOMATED,
  baseUrl:     'https://api.census.gov/data',
  description: 'County-level population data for Georgia. CORS-enabled — fetched directly ' +
               'from the browser. Used only as demographic context, never as voter data.',
  datasets: [
    { id: 'dec-2020',  path: '2020/dec/pl', label: '2020 Decennial Census — County Population' },
    { id: 'dec-2010',  path: '2010/dec/sf1', label: '2010 Decennial Census — County Population' },
    { id: 'acs5-2022', path: '2022/acs/acs5', label: '2022 ACS 5-Year — County Population Estimate' },
    { id: 'acs5-2020', path: '2020/acs/acs5', label: '2020 ACS 5-Year — County Population Estimate' },
    { id: 'acs5-2018', path: '2018/acs/acs5', label: '2018 ACS 5-Year — County Population Estimate' },
  ],
  note: 'Population is supplemental context only. It is never used to estimate voter turnout ' +
        'or as a proxy for registered voters.',
  apiKeyUrl: 'https://api.census.gov/data/key_signup.html',
}

// ─── User Upload ──────────────────────────────────────────────────────────────

export const USER_UPLOAD = {
  id:          'user-upload',
  name:        'Manual File Upload',
  access:      ACCESS.AUTOMATED,
  description: 'CSV, Excel (.xlsx/.xls), or JSON files uploaded directly by the user. ' +
               'The normalizer maps 40+ column aliases to the standard schema automatically.',
  supportedFormats: ['csv', 'xlsx', 'xls', 'json'],
  note: 'This is the primary ingestion path for Georgia SOS data, since the SOS portal ' +
        'and Clarity API are not accessible programmatically.',
}

// ─── Source Registry ──────────────────────────────────────────────────────────

export const SOURCE_REGISTRY = [
  { ...CENSUS_API,      category: 'Population / Context',  priority: 1 },
  { ...SOS_PORTAL,      category: 'Election Results',       priority: 2 },
  { ...SOS_DATA_HUB,    category: 'Election Results',       priority: 2 },
  { ...SOS_VOTER_REG,   category: 'Voter Registration',     priority: 3 },
  { ...USER_UPLOAD,     category: 'User-Provided',          priority: 4 },
  { ...CLARITY_ELECTIONS, category: 'Election Results',     priority: 99 },
]

export function getAccessibleSources() {
  return SOURCE_REGISTRY.filter(s => s.access !== ACCESS.BLOCKED)
}

export function getAutomatedSources() {
  return SOURCE_REGISTRY.filter(s => s.access === ACCESS.AUTOMATED)
}

export function getManualSources() {
  return SOURCE_REGISTRY.filter(s => s.access === ACCESS.MANUAL)
}

export function getBlockedSources() {
  return SOURCE_REGISTRY.filter(s => s.access === ACCESS.BLOCKED)
}
