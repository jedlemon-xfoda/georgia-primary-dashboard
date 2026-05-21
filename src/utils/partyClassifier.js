/**
 * Ballot-universe classification for election records.
 *
 * Priority:
 *   1. Explicit party string → use it directly.
 *   2. Blank / null / MISSING_DATA party + corroborating source context
 *      → Nonpartisan (inferred), flagged with basis.
 *   3. Blank / null / MISSING_DATA party + no corroborating context
 *      → Unknown (needs review), flagged.
 *
 * Calculations are NOT changed by this module — it is a labeling layer only.
 * Callers must surface the `confidence` and `basis` fields to users so that
 * assumptions are never silent.
 */

const EXPLICIT_PARTIES = new Set([
  'republican', 'democratic', 'democrat', 'libertarian',
  'green', 'constitution', 'nonpartisan', 'independent',
])

/**
 * Classify a single record's ballot universe.
 *
 * @param {string|null} candidateParty  Raw party field from the source record.
 * @param {object} [context]            Optional source-level context.
 * @param {string} [context.sourceNote] Human-readable note about the source
 *   (e.g. "Georgia 2026 General Election ballot — nonpartisan section").
 *   When provided and non-empty, blank-party records are classified as
 *   Nonpartisan (inferred) rather than Unknown.
 *
 * @returns {{ universe: string, confidence: 'explicit'|'inferred'|'low', basis: string }}
 */
export function classifyPartyUniverse(candidateParty, context = {}) {
  const raw = (candidateParty ?? '').trim()

  if (raw && raw !== 'MISSING_DATA') {
    const lc = raw.toLowerCase()
    if (EXPLICIT_PARTIES.has(lc)) {
      const label = lc.charAt(0).toUpperCase() + lc.slice(1)
      return { universe: label, confidence: 'explicit', basis: `Party field: "${candidateParty}"` }
    }
    // Unrecognized but non-empty explicit value — honour it.
    return { universe: raw, confidence: 'explicit', basis: `Party field: "${candidateParty}"` }
  }

  // Blank / null / MISSING_DATA
  if (context.sourceNote) {
    return {
      universe: 'Nonpartisan',
      confidence: 'inferred',
      basis: context.sourceNote,
    }
  }

  return {
    universe: 'Unknown',
    confidence: 'low',
    basis: 'Party field is blank or missing and no corroborating source context is available. Review manually.',
  }
}

/**
 * Summarise party-universe classification across a set of records.
 * Returns counts by confidence tier and the distinct basis strings seen.
 *
 * @param {Array}  recs        Election records (must have candidateParty).
 * @param {object} [context]   Passed through to classifyPartyUniverse.
 */
export function auditPartyUniverses(recs, context = {}) {
  const counts = { explicit: 0, inferred: 0, low: 0 }
  const bases  = new Set()
  for (const r of recs) {
    const { confidence, basis } = classifyPartyUniverse(r.candidateParty, context)
    counts[confidence]++
    if (confidence !== 'explicit') bases.add(basis)
  }
  return { counts, bases: [...bases] }
}

/**
 * Standard source note for Georgia primary data where blank-party rows
 * appear in the nonpartisan judicial / constitutional officer section of
 * the official ballot. Import this constant and pass it as context.sourceNote
 * so the assumption is explicit and traceable.
 *
 * This note MUST be updated or replaced when processing data from other
 * states, election types, or years where the ballot structure differs.
 */
export const GEORGIA_NONPARTISAN_NOTE =
  'Blank party — interpreted as Nonpartisan based on Georgia 2026 ballot structure. ' +
  'This assumption may not apply to other states or election years.'
