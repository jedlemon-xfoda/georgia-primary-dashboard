/**
 * Validation script: judicialPattern fix — Bartow County scope classification
 *
 * Simulates the classifyScope() logic before and after removing "judicial"
 * from the judicialPattern regex, against the full set of race types that
 * appear on a Georgia 2026 Republican primary ballot.
 *
 * Run: node scripts/validate-bartow.mjs
 */

// ── Shared helpers ────────────────────────────────────────────────────────────

function normalizeOfficeName(office) {
  if (!office) return office
  return office
    .replace(/\s*[-–—]\s*(republican|democratic|democrat|nonpartisan|libertarian|gop|rep|dem)\s*(primary|ballot|party|ticket)?\s*$/i, '')
    .replace(/\s*\((r|d|rep|dem|republican|democratic)\)\s*$/i, '')
    .trim()
}

// ── BEFORE: original (has "judicial", no Clerk guard) ────────────────────────

function classifyScopeBefore(office) {
  if (!office) return 'other'
  const judicialPattern =
    /(judge|justice|court|appeal|judicial|magistrate|probate|superior|juvenile|state court|supreme)/i
  if (judicialPattern.test(office)) return 'judicial'
  const lc = office.toLowerCase()
  if (lc.includes('governor') || lc.includes('lieutenant governor') || lc.includes('attorney general') ||
      lc.includes('secretary of state') || lc.includes('treasurer') || lc.includes('superintendent') ||
      lc.includes('commissioner of agriculture') || lc.includes('agriculture commissioner') ||
      lc.includes('insurance commissioner') || lc.includes('commissioner of insurance') ||
      lc.includes('labor commissioner') || lc.includes('commissioner of labor') ||
      lc.includes('u.s. senate') || lc.includes('us senate') || lc.includes('united states senate') ||
      lc.includes('public service commission') || lc.includes('public service commissioner'))
    return 'statewide'
  return 'other'
}

// ── AFTER: no "judicial", Clerk guard added ───────────────────────────────────

function classifyScopeAfter(office) {
  if (!office) return 'other'
  if (/\bclerk\s+of\b/i.test(office)) return 'other'
  const judicialPattern =
    /(judge|justice|court|appeal|magistrate|probate|superior|juvenile|state court|supreme)/i
  if (judicialPattern.test(office)) return 'judicial'
  const lc = office.toLowerCase()
  if (lc.includes('governor') || lc.includes('lieutenant governor') || lc.includes('attorney general') ||
      lc.includes('secretary of state') || lc.includes('treasurer') || lc.includes('superintendent') ||
      lc.includes('commissioner of agriculture') || lc.includes('agriculture commissioner') ||
      lc.includes('insurance commissioner') || lc.includes('commissioner of insurance') ||
      lc.includes('labor commissioner') || lc.includes('commissioner of labor') ||
      lc.includes('u.s. senate') || lc.includes('us senate') || lc.includes('united states senate') ||
      lc.includes('public service commission') || lc.includes('public service commissioner'))
    return 'statewide'
  return 'other'
}

// ── Test offices — full Republican ballot traversal for Bartow County ─────────
// Section 1: Republican partisan candidate races (in ballot order)
// Section 2: Nonpartisan General Election (appended at end of ballot)
// Party questions are Yes/No — excluded by isCandidateRecord, not tested here.

const offices = [
  // ── Republican Partisan: Federal statewide ────────────────────────────────
  { office: 'United States Senate',                                   party: 'Republican', section: 'R-partisan' },

  // ── Republican Partisan: Statewide executive ─────────────────────────────
  { office: 'Governor',                                               party: 'Republican', section: 'R-partisan' },
  { office: 'Lieutenant Governor',                                    party: 'Republican', section: 'R-partisan' },
  { office: 'Secretary of State',                                     party: 'Republican', section: 'R-partisan' },
  { office: 'Attorney General',                                       party: 'Republican', section: 'R-partisan' },
  { office: 'Commissioner of Agriculture',                            party: 'Republican', section: 'R-partisan' },
  { office: 'Commissioner of Insurance',                              party: 'Republican', section: 'R-partisan' },
  { office: 'State School Superintendent',                            party: 'Republican', section: 'R-partisan' },
  { office: 'Commissioner of Labor',                                  party: 'Republican', section: 'R-partisan' },
  { office: 'Public Service Commissioner District 3',                 party: 'Republican', section: 'R-partisan' },
  { office: 'Public Service Commissioner District 5',                 party: 'Republican', section: 'R-partisan' },

  // ── Republican Partisan: Congressional ───────────────────────────────────
  { office: 'United States House of Representatives District 14',    party: 'Republican', section: 'R-partisan' },

  // ── Republican Partisan: State legislative ───────────────────────────────
  { office: 'State Senate District 52',                               party: 'Republican', section: 'R-partisan' },
  { office: 'State House of Representatives District 6',             party: 'Republican', section: 'R-partisan' },

  // ── Republican Partisan: Local — DA (THE PROBLEM CASE) ───────────────────
  { office: 'District Attorney Blue Ridge Judicial Circuit',          party: 'Republican', section: 'R-partisan' },
  { office: 'District Attorney Cherokee Judicial Circuit',            party: 'Republican', section: 'R-partisan' },

  // ── Republican Partisan: Local other ─────────────────────────────────────
  { office: 'County Commission Chairperson',                         party: 'Republican', section: 'R-partisan' },
  { office: 'County Commissioner District 1',                        party: 'Republican', section: 'R-partisan' },
  { office: 'Sheriff',                                               party: 'Republican', section: 'R-partisan' },
  { office: 'Clerk of Superior Court',                               party: 'Republican', section: 'R-partisan' },
  { office: 'Tax Commissioner',                                      party: 'Republican', section: 'R-partisan' },

  // ── Nonpartisan General Election: Supreme Court ───────────────────────────
  { office: 'Justice Supreme Court of Georgia',                      party: '',           section: 'NP-judicial' },
  { office: 'Justice Supreme Court of Georgia (To Succeed Land)',    party: '',           section: 'NP-judicial' },
  { office: 'Justice Supreme Court of Georgia (To Succeed Warren)',  party: '',           section: 'NP-judicial' },

  // ── Nonpartisan General Election: Court of Appeals ───────────────────────
  { office: 'Judge Court of Appeals of Georgia',                     party: '',           section: 'NP-judicial' },
  { office: 'Judge Court of Appeals of Georgia (To Succeed Brown)',  party: '',           section: 'NP-judicial' },
  { office: 'Judge Court of Appeals of Georgia (To Succeed Doyle)',  party: '',           section: 'NP-judicial' },
  { office: 'Judge Court of Appeals of Georgia (To Succeed Gobeil)', party: '',           section: 'NP-judicial' },
  { office: 'Judge Court of Appeals of Georgia (To Succeed Markle)', party: '',           section: 'NP-judicial' },

  // ── Nonpartisan General Election: Superior Court ──────────────────────────
  { office: 'Judge Superior Court Blue Ridge Judicial Circuit',      party: '',           section: 'NP-judicial' },
  { office: 'Judge Superior Court Cherokee Judicial Circuit',        party: '',           section: 'NP-judicial' },

  // ── Nonpartisan General Election: Local nonpartisan ──────────────────────
  { office: 'County Board of Education District 1',                 party: '',           section: 'NP-local' },
  { office: 'County Board of Education District 3',                 party: '',           section: 'NP-local' },
]

// ── Run comparison ────────────────────────────────────────────────────────────

const COLS = { office: 55, section: 12, before: 10, after: 10 }
const pad  = (s, n) => String(s).padEnd(n)
const divider = '-'.repeat(COLS.office + COLS.section + COLS.before + COLS.after + 6)

console.log('\nclassifyScope() — BEFORE vs AFTER judicialPattern fix\n')
console.log(pad('Office', COLS.office) + pad('Section', COLS.section) + pad('BEFORE', COLS.before) + pad('AFTER', COLS.after) + 'Changed?')
console.log(divider)

const counts = { before: {}, after: {}, changed: 0 }

for (const { office, party, section } of offices) {
  const normalized = normalizeOfficeName(office)
  const before = classifyScopeBefore(normalized)
  const after  = classifyScopeAfter(normalized)
  const changed = before !== after

  if (changed) counts.changed++
  counts.before[before] = (counts.before[before] || 0) + 1
  counts.after[after]   = (counts.after[after]   || 0) + 1

  const flag = changed ? ' ◄ CHANGED' : ''
  console.log(
    pad(office.slice(0, COLS.office - 1), COLS.office) +
    pad(section, COLS.section) +
    pad(before, COLS.before) +
    pad(after, COLS.after) +
    flag
  )
}

console.log(divider)
console.log(`\n${counts.changed} race(s) changed classification.\n`)

console.log('Scope counts — BEFORE:')
for (const [k, v] of Object.entries(counts.before)) console.log(`  ${k}: ${v}`)

console.log('\nScope counts — AFTER:')
for (const [k, v] of Object.entries(counts.after)) console.log(`  ${k}: ${v}`)

// ── Ballot traversal summary ──────────────────────────────────────────────────
console.log('\n── Republican ballot traversal (AFTER fix) ──────────────────────────────')
const sections = [
  { key: 'R-partisan', label: 'Republican partisan races' },
  { key: 'NP-judicial', label: 'Nonpartisan judicial races (Supreme → CoA → Superior)' },
  { key: 'NP-local',    label: 'Nonpartisan local (school board, etc.)' },
]
for (const { key, label } of sections) {
  const group = offices.filter(o => o.section === key)
  const scopes = group.reduce((acc, o) => {
    const s = classifyScopeAfter(normalizeOfficeName(o.office))
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})
  console.log(`\n${label} (${group.length} offices):`)
  for (const [s, n] of Object.entries(scopes)) console.log(`    ${s}: ${n}`)
}

console.log('\n')
