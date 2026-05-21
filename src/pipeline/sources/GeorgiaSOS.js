// Georgia Secretary of State — Source Catalog & Clarity Elections Client
//
// The Georgia SOS uses Clarity Elections (https://clarityelections.com) for
// live and recent election results. Historical data is published as CSV/Excel
// files at elections.sos.ga.gov.
//
// CORS note: Clarity Elections blocks browser-side fetch requests. Use the
// Node.js fetch scripts in /scripts/ for automated retrieval.
// The Census API (CensusClient.js) IS accessible from the browser.

import { SOURCE } from '../schema.js'

// ─── Known Georgia election catalog ──────────────────────────────────────────
// clarityId: The numeric ID in the Clarity Elections URL.
//   Verify at: https://results.enr.clarityelections.com/GA/
// csvUrl: Direct SOS CSV export URL when available.
// status: 'verified' = ID confirmed. 'estimated' = needs verification.

export const ELECTION_CATALOG = [
  // ── 2024 ──────────────────────────────────────────────────────────────────
  {
    id: 'ga-2024-pp',
    year: 2024, month: 3, day: 12,
    label: '2024 Georgia Presidential Preference Primary',
    type: 'Presidential Primary',
    comparableType: 'Presidential',
    clarityId: '129530',
    clarityStatus: 'estimated',
    csvUrl: null,
    officialStatus: 'Official',
    source: SOURCE.CLARITY,
    clarityBase: 'https://results.enr.clarityelections.com/GA/129530',
    sosPage: 'https://results.enr.clarityelections.com/GA/129530/',
    notes: 'Verify clarityId at https://results.enr.clarityelections.com/GA/',
  },
  {
    id: 'ga-2024-sp',
    year: 2024, month: 5, day: 21,
    label: '2024 Georgia State & Congressional Primary',
    type: 'Primary',
    comparableType: 'Presidential',
    clarityId: null,
    clarityStatus: 'needs_configuration',
    csvUrl: null,
    officialStatus: 'Official',
    source: SOURCE.CLARITY,
    sosPage: 'https://elections.sos.ga.gov/Elections/electionresults.do',
    notes: 'Locate the May 2024 primary at the SOS elections portal.',
  },
  {
    id: 'ga-2024-ge',
    year: 2024, month: 11, day: 5,
    label: '2024 Georgia General Election',
    type: 'General',
    comparableType: 'Presidential',
    clarityId: null,
    clarityStatus: 'needs_configuration',
    csvUrl: null,
    officialStatus: 'Official',
    source: SOURCE.CLARITY,
    sosPage: 'https://elections.sos.ga.gov/Elections/electionresults.do',
    notes: 'Locate the November 2024 general at the SOS elections portal.',
  },

  // ── 2022 ──────────────────────────────────────────────────────────────────
  {
    id: 'ga-2022-sp',
    year: 2022, month: 5, day: 24,
    label: '2022 Georgia State Primary',
    type: 'Primary',
    comparableType: 'Midterm',
    clarityId: '114709',
    clarityStatus: 'estimated',
    csvUrl: null,
    officialStatus: 'Official',
    source: SOURCE.CLARITY,
    clarityBase: 'https://results.enr.clarityelections.com/GA/114709',
    sosPage: 'https://results.enr.clarityelections.com/GA/114709/',
  },
  {
    id: 'ga-2022-spr',
    year: 2022, month: 6, day: 21,
    label: '2022 Georgia State Primary Runoff',
    type: 'Runoff',
    comparableType: 'Runoff',
    clarityId: null,
    clarityStatus: 'needs_configuration',
    csvUrl: null,
    officialStatus: 'Official',
    source: SOURCE.CLARITY,
    sosPage: 'https://elections.sos.ga.gov/Elections/electionresults.do',
  },
  {
    id: 'ga-2022-ge',
    year: 2022, month: 11, day: 8,
    label: '2022 Georgia General Election',
    type: 'General',
    comparableType: 'Midterm',
    clarityId: '116044',
    clarityStatus: 'estimated',
    csvUrl: null,
    officialStatus: 'Official',
    source: SOURCE.CLARITY,
    clarityBase: 'https://results.enr.clarityelections.com/GA/116044',
    sosPage: 'https://results.enr.clarityelections.com/GA/116044/',
  },
  {
    id: 'ga-2022-ger',
    year: 2022, month: 12, day: 6,
    label: '2022 Georgia General Election Runoff (U.S. Senate)',
    type: 'Runoff',
    comparableType: 'Runoff',
    clarityId: null,
    clarityStatus: 'needs_configuration',
    officialStatus: 'Official',
    source: SOURCE.CLARITY,
    sosPage: 'https://elections.sos.ga.gov/Elections/electionresults.do',
  },

  // ── 2020 ──────────────────────────────────────────────────────────────────
  {
    id: 'ga-2020-pp',
    year: 2020, month: 3, day: 24,
    label: '2020 Georgia Presidential Preference Primary',
    type: 'Presidential Primary',
    comparableType: 'Presidential',
    clarityId: '104655',
    clarityStatus: 'estimated',
    csvUrl: null,
    officialStatus: 'Official',
    source: SOURCE.CLARITY,
    clarityBase: 'https://results.enr.clarityelections.com/GA/104655',
    sosPage: 'https://results.enr.clarityelections.com/GA/104655/',
  },
  {
    id: 'ga-2020-sp',
    year: 2020, month: 6, day: 9,
    label: '2020 Georgia State Primary (rescheduled)',
    type: 'Primary',
    comparableType: 'Presidential',
    clarityId: null,
    clarityStatus: 'needs_configuration',
    officialStatus: 'Official',
    source: SOURCE.CLARITY,
    sosPage: 'https://elections.sos.ga.gov/Elections/electionresults.do',
  },
  {
    id: 'ga-2020-ge',
    year: 2020, month: 11, day: 3,
    label: '2020 Georgia General Election',
    type: 'General',
    comparableType: 'Presidential',
    clarityId: '105369',
    clarityStatus: 'estimated',
    csvUrl: null,
    officialStatus: 'Official',
    source: SOURCE.CLARITY,
    clarityBase: 'https://results.enr.clarityelections.com/GA/105369',
    sosPage: 'https://results.enr.clarityelections.com/GA/105369/',
  },
  {
    id: 'ga-2021-sr',
    year: 2021, month: 1, day: 5,
    label: '2021 Georgia U.S. Senate Runoff',
    type: 'Runoff',
    comparableType: 'Runoff',
    clarityId: null,
    clarityStatus: 'needs_configuration',
    officialStatus: 'Official',
    source: SOURCE.CLARITY,
    sosPage: 'https://elections.sos.ga.gov/Elections/electionresults.do',
  },

  // ── 2018 ──────────────────────────────────────────────────────────────────
  {
    id: 'ga-2018-sp',
    year: 2018, month: 5, day: 22,
    label: '2018 Georgia State Primary',
    type: 'Primary',
    comparableType: 'Midterm',
    clarityId: null,
    clarityStatus: 'needs_configuration',
    officialStatus: 'Official',
    source: SOURCE.CLARITY,
    sosPage: 'https://elections.sos.ga.gov/Elections/electionresults.do',
  },
  {
    id: 'ga-2018-ge',
    year: 2018, month: 11, day: 6,
    label: '2018 Georgia General Election',
    type: 'General',
    comparableType: 'Midterm',
    clarityId: null,
    clarityStatus: 'needs_configuration',
    officialStatus: 'Official',
    source: SOURCE.CLARITY,
    sosPage: 'https://elections.sos.ga.gov/Elections/electionresults.do',
  },

  // ── 2016 ──────────────────────────────────────────────────────────────────
  {
    id: 'ga-2016-pp',
    year: 2016, month: 3, day: 1,
    label: '2016 Georgia Presidential Preference Primary (Super Tuesday)',
    type: 'Presidential Primary',
    comparableType: 'Presidential',
    clarityId: null,
    clarityStatus: 'needs_configuration',
    officialStatus: 'Official',
    source: SOURCE.CLARITY,
    sosPage: 'https://elections.sos.ga.gov/Elections/electionresults.do',
  },
  {
    id: 'ga-2016-ge',
    year: 2016, month: 11, day: 8,
    label: '2016 Georgia General Election',
    type: 'General',
    comparableType: 'Presidential',
    clarityId: null,
    clarityStatus: 'needs_configuration',
    officialStatus: 'Official',
    source: SOURCE.CLARITY,
    sosPage: 'https://elections.sos.ga.gov/Elections/electionresults.do',
  },

  // ── 2014 ──────────────────────────────────────────────────────────────────
  {
    id: 'ga-2014-sp',
    year: 2014, month: 5, day: 20,
    label: '2014 Georgia State Primary',
    type: 'Primary',
    comparableType: 'Midterm',
    clarityId: null,
    clarityStatus: 'legacy',
    officialStatus: 'Historical',
    source: SOURCE.SOS_LEGACY,
    sosPage: 'https://elections.sos.ga.gov/Elections/electionresults.do',
    notes: 'Pre-Clarity. Download CSV from SOS historical results portal.',
  },

  // ── 2012 ──────────────────────────────────────────────────────────────────
  {
    id: 'ga-2012-pp',
    year: 2012, month: 3, day: 6,
    label: '2012 Georgia Presidential Preference Primary',
    type: 'Presidential Primary',
    comparableType: 'Presidential',
    clarityId: null,
    clarityStatus: 'legacy',
    officialStatus: 'Historical',
    source: SOURCE.SOS_LEGACY,
    sosPage: 'https://elections.sos.ga.gov/Elections/electionresults.do',
  },

  // ── 2010 ──────────────────────────────────────────────────────────────────
  {
    id: 'ga-2010-sp',
    year: 2010, month: 7, day: 20,
    label: '2010 Georgia State Primary',
    type: 'Primary',
    comparableType: 'Midterm',
    clarityId: null,
    clarityStatus: 'legacy',
    officialStatus: 'Historical',
    source: SOURCE.SOS_LEGACY,
    sosPage: 'https://elections.sos.ga.gov/Elections/electionresults.do',
  },

  // ── 2008 ──────────────────────────────────────────────────────────────────
  {
    id: 'ga-2008-pp',
    year: 2008, month: 2, day: 5,
    label: '2008 Georgia Presidential Preference Primary',
    type: 'Presidential Primary',
    comparableType: 'Presidential',
    clarityId: null,
    clarityStatus: 'legacy',
    officialStatus: 'Historical',
    source: SOURCE.SOS_LEGACY,
    sosPage: 'https://elections.sos.ga.gov/Elections/electionresults.do',
  },

  // ── 2004 ──────────────────────────────────────────────────────────────────
  {
    id: 'ga-2004-pp',
    year: 2004, month: 3, day: 2,
    label: '2004 Georgia Presidential Preference Primary',
    type: 'Presidential Primary',
    comparableType: 'Presidential',
    clarityId: null,
    clarityStatus: 'legacy',
    officialStatus: 'Historical',
    source: SOURCE.SOS_LEGACY,
    sosPage: 'https://elections.sos.ga.gov/Elections/electionresults.do',
  },

  // ── 2000 ──────────────────────────────────────────────────────────────────
  {
    id: 'ga-2000-pp',
    year: 2000, month: 3, day: 7,
    label: '2000 Georgia Presidential Preference Primary',
    type: 'Presidential Primary',
    comparableType: 'Presidential',
    clarityId: null,
    clarityStatus: 'legacy',
    officialStatus: 'Historical',
    source: SOURCE.SOS_LEGACY,
    sosPage: 'https://elections.sos.ga.gov/Elections/electionresults.do',
  },
]

// ─── Clarity API endpoint builder ─────────────────────────────────────────────
// Note: These endpoints are CORS-blocked in browsers.
// Use /scripts/fetch-sos.mjs to download via Node.js.

export const CLARITY_BASE = 'https://results.enr.clarityelections.com/GA'

export function clarityEndpoints(electionId, version) {
  const base = `${CLARITY_BASE}/${electionId}`
  const ver  = version ? `${base}/${version}` : null
  return {
    version:       `${base}/current_ver.txt`,
    settings:      ver ? `${ver}/json/en/electionsettings.json` : null,
    summaryJson:   ver ? `${ver}/json/en/summary.json`          : null,
    detailXmlZip:  ver ? `${ver}/reports/detailxml.zip`         : null,
    summaryCsv:    ver ? `${ver}/reports/summary.csv`           : null,
    portalUrl:     `${base}/`,
  }
}

// ─── Georgia SOS direct download info ────────────────────────────────────────

export const SOS_PORTAL = 'https://elections.sos.ga.gov/Elections/electionresults.do'
export const SOS_VOTER_REG = 'https://elections.sos.ga.gov/Elections/voterregistrationstats.do'
export const SOS_HISTORICAL = 'https://elections.sos.ga.gov/Elections/electionresults.do'

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getCatalogEntry(id) {
  return ELECTION_CATALOG.find(e => e.id === id)
}

export function getCatalogByYear(year) {
  return ELECTION_CATALOG.filter(e => e.year === year)
}

export function getVerifiedEntries() {
  return ELECTION_CATALOG.filter(e => e.clarityId && e.clarityStatus !== 'needs_configuration')
}

export function getEntriesNeedingConfiguration() {
  return ELECTION_CATALOG.filter(e => e.clarityStatus === 'needs_configuration')
}

// Column map for Georgia SOS CSV export format
// Different SOS export vintages use slightly different column names.
// The normalizer handles all known variants via COLUMN_ALIASES.
export const SOS_COLUMN_HINTS = {
  county:      'County Name',
  precinct:    'Precinct Name',
  office:      'Race Name',
  candidate:   'Candidate Name',
  party:       'Party Name',
  votes:       'Total Votes',
  electionDay: 'Election Day Votes',
  earlyVotes:  'Advance Voting Votes',
  absentee:    'Absentee by Mail Votes',
  provisional: 'Provisional Votes',
  electionDate:'Election Date',
  electionType:'Election Type',
}
