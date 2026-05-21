#!/usr/bin/env node
// scripts/fetch-census.mjs
// Fetches U.S. Census population data for Georgia counties.
// Requires Node.js 18+ (uses built-in fetch). No API key required.
// Run: node scripts/fetch-census.mjs [--year 2020] [--api-key YOUR_KEY]
//
// Output: public/data/context/census-{dataset}.json
//         public/data/pipeline-manifest.json (updated)

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir   = dirname(fileURLToPath(import.meta.url))
const ROOT    = resolve(__dir, '..')
const OUT_DIR = resolve(ROOT, 'public/data/context')
const MANIFEST = resolve(ROOT, 'public/data/pipeline-manifest.json')

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args     = process.argv.slice(2)
const apiKey   = args.find((a, i) => args[i-1] === '--api-key')
const yearArg  = args.find((a, i) => args[i-1] === '--year')
const dryRun   = args.includes('--dry-run')

// ─── Census datasets to fetch ─────────────────────────────────────────────────

const DATASETS = [
  { id: 'census-dec-2020', year: 2020, dataset: 'dec/pl',    popVar: 'P1_001N',      label: 'Decennial Census 2020' },
  { id: 'census-acs-2022', year: 2022, dataset: 'acs/acs5',  popVar: 'B01003_001E',  label: 'ACS 5-Year 2022' },
  { id: 'census-acs-2020', year: 2020, dataset: 'acs/acs5',  popVar: 'B01003_001E',  label: 'ACS 5-Year 2020' },
  { id: 'census-dec-2010', year: 2010, dataset: 'dec/sf1',   popVar: 'P001001',      label: 'Decennial Census 2010' },
  { id: 'census-dec-2000', year: 2000, dataset: 'dec/sf1',   popVar: 'P001001',      label: 'Decennial Census 2000' },
]

const GA_FIPS = '13'

// ─── County FIPS lookup ───────────────────────────────────────────────────────

const GA_COUNTY_FIPS = {
  '001':'Appling','003':'Atkinson','005':'Bacon','007':'Baker','009':'Baldwin',
  '011':'Banks','013':'Barrow','015':'Bartow','017':'Ben Hill','019':'Berrien',
  '021':'Bibb','023':'Bleckley','025':'Brantley','027':'Brooks','029':'Bryan',
  '031':'Bulloch','033':'Burke','035':'Butts','037':'Calhoun','039':'Camden',
  '043':'Candler','045':'Carroll','047':'Catoosa','049':'Charlton','051':'Chatham',
  '053':'Chattahoochee','055':'Chattooga','057':'Cherokee','059':'Clarke',
  '061':'Clay','063':'Clayton','065':'Clinch','067':'Cobb','069':'Coffee',
  '071':'Colquitt','073':'Columbia','075':'Cook','077':'Coweta','079':'Crawford',
  '081':'Crisp','083':'Dade','085':'Dawson','087':'Decatur','089':'DeKalb',
  '091':'Dodge','093':'Dooly','095':'Dougherty','097':'Douglas','099':'Early',
  '101':'Echols','103':'Effingham','105':'Elbert','107':'Emanuel','109':'Evans',
  '111':'Fannin','113':'Fayette','115':'Floyd','117':'Forsyth','119':'Franklin',
  '121':'Fulton','123':'Gilmer','125':'Glascock','127':'Glynn','129':'Gordon',
  '131':'Grady','133':'Greene','135':'Gwinnett','137':'Habersham','139':'Hall',
  '141':'Hancock','143':'Haralson','145':'Harris','147':'Hart','149':'Heard',
  '151':'Henry','153':'Houston','155':'Irwin','157':'Jackson','159':'Jasper',
  '161':'Jeff Davis','163':'Jefferson','165':'Jenkins','167':'Johnson','169':'Jones',
  '171':'Lamar','173':'Lanier','175':'Laurens','177':'Lee','179':'Liberty',
  '181':'Lincoln','183':'Long','185':'Lowndes','187':'Lumpkin','189':'McDuffie',
  '191':'McIntosh','193':'Macon','195':'Madison','197':'Marion','199':'Meriwether',
  '201':'Miller','205':'Mitchell','207':'Monroe','209':'Montgomery','211':'Morgan',
  '213':'Murray','215':'Muscogee','217':'Newton','219':'Oconee','221':'Oglethorpe',
  '223':'Paulding','225':'Peach','227':'Pickens','229':'Pierce','231':'Pike',
  '233':'Polk','235':'Pulaski','237':'Putnam','239':'Quitman','241':'Rabun',
  '243':'Randolph','245':'Richmond','247':'Rockdale','249':'Schley','251':'Screven',
  '253':'Seminole','255':'Spalding','257':'Stephens','259':'Stewart','261':'Sumter',
  '263':'Talbot','265':'Taliaferro','267':'Tattnall','269':'Taylor','271':'Telfair',
  '273':'Terrell','275':'Thomas','277':'Tift','279':'Toombs','281':'Towns',
  '283':'Treutlen','285':'Troup','287':'Turner','289':'Twiggs','291':'Union',
  '293':'Upson','295':'Walker','297':'Walton','299':'Ware','301':'Warren',
  '303':'Washington','305':'Wayne','307':'Webster','309':'Wheeler','311':'White',
  '313':'Whitfield','315':'Wilcox','317':'Wilkes','319':'Wilkinson','321':'Worth',
}

// ─── Fetch and normalize ──────────────────────────────────────────────────────

async function fetchDataset(ds) {
  const params = new URLSearchParams({
    get: `NAME,${ds.popVar}`,
    for: 'county:*',
    in:  `state:${GA_FIPS}`,
  })
  if (apiKey) params.set('key', apiKey)

  const url = `https://api.census.gov/data/${ds.year}/${ds.dataset}?${params}`
  console.log(`  GET ${url.replace(/key=\S+/, 'key=***')}`)

  const resp = await fetch(url, { headers: { 'User-Agent': 'Georgia-Primary-Dashboard-Pipeline/1.0' } })

  // Census API now redirects to missing_key.html when no key is provided
  if (resp.url?.includes('missing_key') || resp.url?.includes('key_signup')) {
    throw new Error('Census API key required. Pass --api-key YOUR_KEY. Get a free key at https://api.census.gov/data/key_signup.html')
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Census API HTTP ${resp.status}: ${body.slice(0, 200)}`)
  }

  let rows
  try {
    rows = await resp.json()
  } catch {
    throw new Error('Census API returned non-JSON response (API key may be required)')
  }
  const headers = rows[0]
  const popIdx  = headers.indexOf(ds.popVar)
  const cntyIdx = headers.indexOf('county')
  const statIdx = headers.indexOf('state')

  const records = rows.slice(1).map(row => {
    const cFips   = row[cntyIdx]?.padStart(3, '0')
    const sFips   = row[statIdx]
    const fips    = `${sFips}${cFips}`
    const county  = GA_COUNTY_FIPS[cFips] || `Unknown (${cFips})`
    const pop     = parseInt(row[popIdx], 10)

    return {
      county,
      fips,
      year:       ds.year,
      population: isNaN(pop) ? null : pop,
      source:     `U.S. Census ${ds.label}`,
      sourceUrl:  url.replace(/key=\S+/, 'key=***'),
      dataset:    ds.dataset,
    }
  }).filter(r => r.county && !r.county.startsWith('Unknown'))

  return records
}

// ─── Update manifest ──────────────────────────────────────────────────────────

function updateManifest(newContextEntries) {
  let manifest = { version: '1.0', elections: [], context: [], lastUpdated: null }
  if (existsSync(MANIFEST)) {
    try { manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) } catch {}
  }

  for (const entry of newContextEntries) {
    const idx = manifest.context.findIndex(e => e.id === entry.id)
    if (idx >= 0) manifest.context[idx] = entry
    else manifest.context.push(entry)
  }

  manifest.lastUpdated = new Date().toISOString()
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  let datasets = DATASETS
  if (yearArg) datasets = DATASETS.filter(d => String(d.year) === yearArg)

  console.log(`\nCensus Pipeline — fetching ${datasets.length} dataset(s)`)
  console.log('═'.repeat(60))
  if (!apiKey) {
    console.log('WARNING: No Census API key provided. The Census API now requires a key for all requests.')
    console.log('Get a free key at: https://api.census.gov/data/key_signup.html')
    console.log('Pass it with: --api-key YOUR_KEY\n')
  }

  const manifestEntries = []

  for (const ds of datasets) {
    console.log(`\n● ${ds.label} (${ds.year})`)
    if (dryRun) { console.log('  DRY RUN'); continue }

    try {
      const records = await fetchDataset(ds)
      const outFile = resolve(OUT_DIR, `${ds.id}.json`)

      const fileData = {
        _meta: {
          id:          ds.id,
          label:       ds.label,
          dataset:     ds.dataset,
          year:        ds.year,
          fetchedAt:   new Date().toISOString(),
          recordCount: records.length,
          source:      'U.S. Census Bureau',
        },
        records,
      }

      writeFileSync(outFile, JSON.stringify(fileData, null, 2))
      console.log(`  ✓ ${records.length} counties → ${outFile.replace(ROOT, '.')}`)

      manifestEntries.push({
        id:          ds.id,
        file:        `context/${ds.id}.json`,
        label:       ds.label,
        year:        ds.year,
        source:      'U.S. Census Bureau',
        dataType:    'population',
        recordCount: records.length,
        fetchedAt:   new Date().toISOString(),
      })

    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`)
    }

    // Polite delay between Census API requests
    await new Promise(r => setTimeout(r, 500))
  }

  updateManifest(manifestEntries)
  console.log('\nManifest updated.')
  console.log('Done.')
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
