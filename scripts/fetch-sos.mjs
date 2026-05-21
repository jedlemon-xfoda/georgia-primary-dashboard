#!/usr/bin/env node
// scripts/fetch-sos.mjs
// Fetches Georgia SOS election results from Clarity Elections API.
// Requires Node.js 18+ (uses built-in fetch).
// Run: node scripts/fetch-sos.mjs [--election ga-2024-pp] [--all]
//
// Output: public/data/elections/{id}.json (normalized records)
//         public/data/pipeline-manifest.json (updated)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { createGunzip } from 'zlib'

const __dir    = dirname(fileURLToPath(import.meta.url))
const ROOT     = resolve(__dir, '..')
const OUT_DIR  = resolve(ROOT, 'public/data/elections')
const MANIFEST = resolve(ROOT, 'public/data/pipeline-manifest.json')

const config = JSON.parse(readFileSync(resolve(__dir, 'sos-config.json'), 'utf8'))

// ─── Argument parsing ─────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const fetchAll  = args.includes('--all')
const targetId  = args.find((a, i) => args[i-1] === '--election')
const dryRun    = args.includes('--dry-run')

// ─── Clarity API helpers ──────────────────────────────────────────────────────

const CLARITY_BASE = 'https://results.enr.clarityelections.com/GA'
const UA = config.userAgent || 'Georgia-Primary-Dashboard-Pipeline/1.0'
const DELAY_MS = config.requestDelayMs || 1500

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function clarityFetch(url, label) {
  console.log(`  GET ${url}`)
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': '*/*' },
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${label}`)
  return resp
}

async function getVersion(electionId) {
  const url  = `${CLARITY_BASE}/${electionId}/current_ver.txt`
  const resp = await clarityFetch(url, 'version')
  return (await resp.text()).trim()
}

async function getSummaryJSON(electionId, version) {
  const url  = `${CLARITY_BASE}/${electionId}/${version}/json/en/summary.json`
  const resp = await clarityFetch(url, 'summary JSON')
  return resp.json()
}

async function getElectionSettings(electionId, version) {
  const url = `${CLARITY_BASE}/${electionId}/${version}/json/en/electionsettings.json`
  try {
    const resp = await clarityFetch(url, 'settings')
    return resp.json()
  } catch {
    return null
  }
}

// ─── Clarity JSON normalizer ──────────────────────────────────────────────────
// Parses Clarity summary JSON into flat normalized records.
// Clarity structure: { Contest: [ { text, party, ch: [ { text, party, cty: [{n, v}] } ] } ] }

function parseClarityJSON(data, electionEntry) {
  const records = []
  const contests = data?.Contest || data?.contest || []
  if (!contests.length) {
    console.warn('  Warning: No contests found in Clarity JSON')
    return records
  }

  for (const contest of contests) {
    const officeName  = contest.text || contest.raceTitle || 'Unknown'
    const contestParty = normalizePartyCode(contest.party || contest.Party || '')
    const choices     = contest.ch || contest.choices || contest.Choice || []

    for (const choice of choices) {
      const candidateName = choice.text || choice.name || 'Unknown'
      const candidateParty = normalizePartyCode(choice.party || choice.Party || contest.party || '')
      const counties = choice.cty || choice.counties || choice.County || []

      for (const cty of counties) {
        const countyName = cty.n || cty.name || cty.Name || 'Unknown'
        const totalVotes = parseInt(cty.v || cty.votes || cty.Votes || 0, 10)

        if (totalVotes < 0) continue

        records.push({
          year:           electionEntry.year,
          electionDate:   `${electionEntry.year}-${String(electionEntry.month || 1).padStart(2,'0')}-${String(electionEntry.day || 1).padStart(2,'0')}`,
          electionType:   electionEntry.type || 'Primary',
          county:         countyName.replace(/\s+County$/i,''),
          office:         officeName,
          candidate:      candidateName,
          candidateParty: candidateParty,
          ballotType:     candidateParty,
          voteMethod:     'Total',
          votes:          totalVotes,
          electionDayVotes: null,
          earlyVotes:     null,
          absenteeVotes:  null,
          registeredVoters: null,
          officialStatus: electionEntry.officialStatus || 'Official',
          source:         'Georgia SOS / Clarity Elections',
          sourceUrl:      electionEntry.clarityBase || '',
          confidence:     electionEntry.clarityStatus === 'verified' ? 1.0 : 0.85,
          comparableType: electionEntry.year % 4 === 0 ? 'Presidential' : 'Midterm',
        })
      }
    }
  }

  return records
}

function normalizePartyCode(code) {
  if (!code) return 'Unknown'
  const u = code.toString().toUpperCase().trim()
  const map = {
    'REP': 'Republican', 'R':   'Republican', 'REPUBLICAN': 'Republican',
    'DEM': 'Democratic', 'D':   'Democratic', 'DEMOCRATIC': 'Democratic',
    'LIB': 'Libertarian','L':   'Libertarian','LIBERTARIAN': 'Libertarian',
    'GRN': 'Green',      'GREEN': 'Green',
    'IND': 'Independent','INDEPENDENT': 'Independent',
    'NP':  'Nonpartisan','NONPARTISAN':  'Nonpartisan',
  }
  return map[u] || code.toString().trim() || 'Unknown'
}

// ─── Record deduplication and ID generation ───────────────────────────────────

function addIds(records) {
  return records.map(r => ({
    ...r,
    id: [r.year, r.county, r.office, r.candidate, r.voteMethod]
      .join('|').replace(/\s+/g, '_').slice(0, 120),
  }))
}

// ─── Fetch single election ────────────────────────────────────────────────────

async function fetchElection(electionEntry) {
  const { id, clarityId, label } = electionEntry
  console.log(`\n● ${label}`)

  if (!clarityId) {
    console.log('  SKIP — clarityId not configured in sos-config.json')
    return { id, status: 'skipped', reason: 'No clarityId configured' }
  }

  if (dryRun) {
    console.log('  DRY RUN — would fetch from Clarity ID', clarityId)
    return { id, status: 'dry_run' }
  }

  try {
    // Step 1: Get current version
    console.log('  Fetching version...')
    const version = await getVersion(clarityId)
    console.log(`  Version: ${version}`)
    await sleep(DELAY_MS)

    // Step 2: Get election settings
    const settings = await getElectionSettings(clarityId, version)
    console.log(`  Settings: ${settings ? 'OK' : 'unavailable'}`)
    await sleep(DELAY_MS)

    // Step 3: Get summary JSON
    console.log('  Fetching summary JSON...')
    const summaryData = await getSummaryJSON(clarityId, version)
    await sleep(DELAY_MS)

    // Step 4: Parse and normalize
    let records = parseClarityJSON(summaryData, electionEntry)
    records     = addIds(records)

    if (!records.length) {
      throw new Error('No records parsed from Clarity JSON')
    }

    // Step 5: Write output
    const outFile    = resolve(OUT_DIR, `${id}.json`)
    const fileData   = {
      _meta: {
        id:            id,
        label:         label,
        clarityId:     clarityId,
        version,
        electionType:  electionEntry.type,
        officialStatus: electionEntry.officialStatus,
        fetchedAt:     new Date().toISOString(),
        recordCount:   records.length,
        source:        'Georgia SOS / Clarity Elections',
        sourceUrl:     `${CLARITY_BASE}/${clarityId}/`,
      },
      records,
    }

    writeFileSync(outFile, JSON.stringify(fileData, null, 2))
    console.log(`  ✓ Wrote ${records.length} records to ${outFile.replace(ROOT, '.')}`)

    return {
      id,
      file:          `elections/${id}.json`,
      year:          electionEntry.year,
      type:          electionEntry.type,
      label:         label,
      source:        'Georgia SOS / Clarity Elections',
      sourceUrl:     `${CLARITY_BASE}/${clarityId}/`,
      clarityId,
      recordCount:   records.length,
      status:        electionEntry.officialStatus || 'Official',
      confidence:    electionEntry.clarityStatus === 'verified' ? 1.0 : 0.85,
      fetchedAt:     new Date().toISOString(),
      fetchStatus:   'success',
    }

  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`)
    return { id, status: 'failed', error: err.message }
  }
}

// ─── Update manifest ──────────────────────────────────────────────────────────

function updateManifest(newEntries) {
  let manifest = { version: '1.0', elections: [], context: [], lastUpdated: null }
  if (existsSync(MANIFEST)) {
    try { manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) } catch {}
  }

  for (const entry of newEntries) {
    if (!entry.file) continue
    const idx = manifest.elections.findIndex(e => e.id === entry.id)
    if (idx >= 0) {
      manifest.elections[idx] = entry
    } else {
      manifest.elections.push(entry)
    }
  }

  manifest.lastUpdated = new Date().toISOString()
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2))
  console.log(`\nManifest updated: ${MANIFEST.replace(ROOT, '.')}`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  let elections = config.elections.filter(e => e.enabled)
  if (targetId) {
    elections = elections.filter(e => e.id === targetId)
    if (!elections.length) {
      console.error(`No enabled election found with id: ${targetId}`)
      process.exit(1)
    }
  }
  if (!fetchAll && !targetId) {
    elections = elections.filter(e => e.clarityId)
  }

  if (!elections.length) {
    console.log('No elections to fetch. Check sos-config.json — set enabled: true and provide clarityId values.')
    return
  }

  console.log(`\nGeorgia SOS Pipeline — fetching ${elections.length} election(s)`)
  console.log('═'.repeat(60))

  const results  = []
  for (const election of elections) {
    const result = await fetchElection(election)
    results.push(result)
    await sleep(DELAY_MS)
  }

  const successful = results.filter(r => r.fetchStatus === 'success')
  updateManifest(successful)

  console.log('\n' + '═'.repeat(60))
  console.log(`Done: ${successful.length}/${elections.length} elections fetched successfully`)
  if (results.filter(r => r.status === 'failed').length > 0) {
    console.log('Failed elections:')
    results.filter(r => r.status === 'failed').forEach(r => {
      console.log(`  ${r.id}: ${r.error}`)
    })
    console.log('\nIf an election fails, verify its clarityId at:')
    console.log('  https://results.enr.clarityelections.com/GA/')
  }
}

main().catch(e => { console.error('Fatal error:', e.message); process.exit(1) })
