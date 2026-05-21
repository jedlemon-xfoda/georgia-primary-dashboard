// Centralized predicate for identifying actual candidate records.
//
// Georgia SOS exports mix genuine candidate rows with ballot-summary
// placeholders (Yes/No, Undervotes, etc.) and non-candidate contest
// types (referenda, party questions, constitutional amendments).
//
// isCandidateRecord(r) returns true only for records that represent
// a real person/slate running in a partisan or nonpartisan race.
// All other records remain in the raw elections array for analytics.

const AGGREGATE_CANDIDATE_NAMES = new Set([
  'ballots cast',
  'total votes',
  'registered voters',
  'yes',
  'no',
  'undervotes',
  'overvotes',
  'over votes',
  'under votes',
  'scattering',
  'missing_data',
])

const AGGREGATE_OFFICE_FRAGMENTS = [
  'party question',
  'referendum',
  'constitutional amendment',
  'ballot question',
]

/**
 * Returns true only when r is a genuine candidate-level record:
 *   • office is not BALLOT_TOTALS
 *   • office is not a referendum / question contest
 *   • candidate name is present and not a ballot-summary placeholder
 */
export function isCandidateRecord(r) {
  if (!r || r.office === 'BALLOT_TOTALS') return false

  if (r.office) {
    const officeLc = r.office.toLowerCase()
    if (AGGREGATE_OFFICE_FRAGMENTS.some(f => officeLc.includes(f))) return false
  }

  const name = r.candidate?.trim()
  if (!name || name === 'MISSING_DATA') return false
  return !AGGREGATE_CANDIDATE_NAMES.has(name.toLowerCase())
}

/**
 * Returns true when r is a race record (candidate-level, non-referendum)
 * without requiring a specific candidate name. Use for office-level
 * aggregations like roll-off analysis where the candidate name is not
 * the grouping key but referendum offices still need to be excluded.
 */
export function isRaceRecord(r) {
  if (!r || r.office === 'BALLOT_TOTALS') return false
  if (!r.office || r.office === 'MISSING_DATA') return false
  const officeLc = r.office.toLowerCase()
  return !AGGREGATE_OFFICE_FRAGMENTS.some(f => officeLc.includes(f))
}
