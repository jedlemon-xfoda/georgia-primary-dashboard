// Data Validator
// Validates records against FIELD_SPEC.
// NEVER estimates, fills in, or generates missing values.
// Absent optional fields are marked MISSING. Absent required fields fail validation.

import { MISSING, isMissing, FIELD_SPEC } from '../schema.js'

// Validate a single field value against its spec
function validateField(fieldName, value, spec) {
  const errors = []
  const warnings = []

  if (isMissing(value)) {
    if (spec.required) {
      errors.push({ field: fieldName, reason: `Required field "${spec.label}" is absent` })
    }
    return { value: MISSING, errors, warnings }
  }

  let coerced = value

  if (spec.type === 'integer') {
    const n = parseInt(value, 10)
    if (isNaN(n)) {
      errors.push({ field: fieldName, reason: `"${spec.label}" must be an integer, got: ${value}` })
      return { value: MISSING, errors, warnings }
    }
    if (spec.min != null && n < spec.min) {
      errors.push({ field: fieldName, reason: `"${spec.label}" must be ≥ ${spec.min}, got: ${n}` })
    }
    if (spec.max != null && n > spec.max) {
      warnings.push({ field: fieldName, reason: `"${spec.label}" value ${n} exceeds expected max ${spec.max}` })
    }
    coerced = n

  } else if (spec.type === 'float') {
    const f = parseFloat(value)
    if (isNaN(f)) {
      errors.push({ field: fieldName, reason: `"${spec.label}" must be a number, got: ${value}` })
      return { value: MISSING, errors, warnings }
    }
    if (spec.min != null && f < spec.min) {
      errors.push({ field: fieldName, reason: `"${spec.label}" must be ≥ ${spec.min}` })
    }
    if (spec.max != null && f > spec.max) {
      errors.push({ field: fieldName, reason: `"${spec.label}" must be ≤ ${spec.max}` })
    }
    coerced = f

  } else if (spec.type === 'date') {
    const d = new Date(value)
    if (isNaN(d.getTime())) {
      warnings.push({ field: fieldName, reason: `"${spec.label}" could not be parsed as a date: ${value}` })
      coerced = String(value)
    } else {
      coerced = d.toISOString().slice(0, 10)
    }

  } else if (spec.type === 'enum') {
    if (spec.values && !spec.values.includes(value)) {
      warnings.push({ field: fieldName, reason: `"${spec.label}" value "${value}" not in expected set: ${spec.values.join(', ')}` })
    }

  } else if (spec.type === 'string') {
    coerced = String(value).trim()
    if (coerced === '') {
      return { value: MISSING, errors, warnings }
    }
  }

  return { value: coerced, errors, warnings }
}

// Validate a single normalized record
export function validateRecord(record) {
  const errors = []
  const warnings = []
  const validated = { ...record }

  for (const [fieldName, spec] of Object.entries(FIELD_SPEC)) {
    const rawValue = record[fieldName]
    const result   = validateField(fieldName, rawValue, spec)
    validated[fieldName] = result.value
    errors.push(...result.errors)
    warnings.push(...result.warnings)
  }

  return {
    valid:    errors.length === 0,
    record:   validated,
    errors,
    warnings,
  }
}

// Validate a batch of records
export function validateBatch(records) {
  const valid     = []
  const invalid   = []
  const allErrors = []
  const allWarns  = []

  for (const record of records) {
    const result = validateRecord(record)
    allErrors.push(...result.errors)
    allWarns.push(...result.warnings)
    if (result.valid) {
      valid.push(result.record)
    } else {
      invalid.push({ record: result.record, errors: result.errors })
    }
  }

  return {
    valid,
    invalid,
    stats: {
      total:    records.length,
      passed:   valid.length,
      failed:   invalid.length,
      errors:   allErrors.length,
      warnings: allWarns.length,
    },
    allErrors,
    allWarnings: allWarns,
  }
}

// Mark specific fields as MISSING on a record (non-destructive)
export function markMissing(record, fields) {
  const out = { ...record }
  for (const f of fields) {
    out[f] = MISSING
  }
  return out
}

// Check if a record has enough data to be useful.
// Year and county are NOT required — SOS exports may omit them (e.g. statewide "Total Votes" sheets).
// Only votes is required; county/precinct being absent is handled gracefully by the UI.
export function isUsableRecord(record) {
  return (
    !isMissing(record.votes) &&
    record.votes !== MISSING &&
    Number(record.votes) >= 0
  )
}

// Check if votes columns are internally consistent (ed + early + absentee ≈ total)
export function checkVoteConsistency(record) {
  const warnings = []
  const { votes, electionDayVotes, earlyVotes, absenteeVotes } = record

  if (
    !isMissing(votes) &&
    !isMissing(electionDayVotes) &&
    !isMissing(earlyVotes) &&
    !isMissing(absenteeVotes)
  ) {
    const componentSum = Number(electionDayVotes) + Number(earlyVotes) + Number(absenteeVotes)
    const total = Number(votes)
    const diff = Math.abs(total - componentSum)
    if (diff > 0 && diff / Math.max(total, 1) > 0.02) {
      warnings.push({
        field: 'votes',
        reason: `Total votes (${total}) differs from component sum (${componentSum}) by ${diff}`,
      })
    }
  }

  return warnings
}
