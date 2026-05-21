#!/usr/bin/env node
// scripts/run-pipeline.mjs
// Full pipeline: fetch all configured Georgia SOS elections + Census population data.
// Run: node scripts/run-pipeline.mjs [--dry-run] [--skip-sos] [--skip-census]
//
// What this does:
//   1. Fetches configured elections from Georgia SOS / Clarity Elections
//   2. Fetches Census population data for Georgia counties
//   3. Writes normalized JSON to public/data/
//   4. Updates public/data/pipeline-manifest.json
//
// After running, start the dev server and use the Pipeline tab to load the data.

import { execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = resolve(__dir, '..')

const args       = process.argv.slice(2)
const dryRun     = args.includes('--dry-run')
const skipSOS    = args.includes('--skip-sos')
const skipCensus = args.includes('--skip-census')
const apiKey     = args.find((a, i) => args[i-1] === '--census-key')

function run(cmd, label) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`Running: ${label}`)
  console.log('─'.repeat(60))
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' })
  } catch (err) {
    console.error(`Step failed: ${label}`)
    console.error(err.message)
  }
}

async function main() {
  console.log('═'.repeat(60))
  console.log(' Georgia Primary Intelligence Dashboard — Data Pipeline')
  console.log('═'.repeat(60))
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Start: ${new Date().toISOString()}`)

  if (!skipSOS) {
    const dryFlag  = dryRun ? ' --dry-run' : ''
    run(`node scripts/fetch-sos.mjs --all${dryFlag}`, 'Georgia SOS / Clarity Elections')
  } else {
    console.log('\nSkipping SOS fetch (--skip-sos)')
  }

  if (!skipCensus) {
    const dryFlag  = dryRun ? ' --dry-run' : ''
    const keyFlag  = apiKey ? ` --api-key ${apiKey}` : ''
    run(`node scripts/fetch-census.mjs${dryFlag}${keyFlag}`, 'U.S. Census Bureau')
  } else {
    console.log('\nSkipping Census fetch (--skip-census)')
  }

  // Print summary
  console.log('\n' + '═'.repeat(60))
  console.log('Pipeline complete.')
  try {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, 'public/data/pipeline-manifest.json'), 'utf8'))
    console.log(`Elections in manifest: ${manifest.elections?.length || 0}`)
    console.log(`Context datasets:      ${manifest.context?.length || 0}`)
    console.log(`Last updated:          ${manifest.lastUpdated || 'N/A'}`)
  } catch {
    console.log('Could not read manifest.')
  }
  console.log('\nNext step: Load the data in the dashboard → Import Data → Pipeline tab')
}

main()
