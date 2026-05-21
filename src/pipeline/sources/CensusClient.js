// U.S. Census Bureau API Client
// Fetches population and demographic data for Georgia counties.
// The Census API supports CORS — this module works directly in the browser.
// No API key required for basic requests (key recommended for production use).
//
// Georgia FIPS state code: 13
// County FIPS codes: 13001 (Appling) through 13321 (Worth)

const CENSUS_BASE = 'https://api.census.gov/data'
const GA_FIPS = '13'

// ─── Available Census datasets ────────────────────────────────────────────────

export const CENSUS_DATASETS = [
  {
    id: 'acs5-2022',
    label: 'ACS 5-Year 2022 (County Population)',
    year: 2022,
    dataset: 'acs/acs5',
    variables: { population: 'B01003_001E' },
    description: 'American Community Survey 5-year estimates (2018–2022). Population by county.',
  },
  {
    id: 'acs5-2020',
    label: 'ACS 5-Year 2020 (County Population)',
    year: 2020,
    dataset: 'acs/acs5',
    variables: { population: 'B01003_001E' },
    description: 'ACS 5-year estimates (2016–2020).',
  },
  {
    id: 'dec-2020',
    label: 'Decennial Census 2020 (County Population)',
    year: 2020,
    dataset: 'dec/pl',
    variables: { population: 'P1_001N' },
    description: 'Most accurate county population count. No API key required.',
  },
  {
    id: 'dec-2010',
    label: 'Decennial Census 2010 (County Population)',
    year: 2010,
    dataset: 'dec/sf1',
    variables: { population: 'P001001' },
    description: 'Decennial Census 2010 county populations.',
  },
  {
    id: 'dec-2000',
    label: 'Decennial Census 2000 (County Population)',
    year: 2000,
    dataset: 'dec/sf1',
    variables: { population: 'P001001' },
    description: 'Decennial Census 2000 county populations.',
  },
]

// ─── County FIPS to name mapping for Georgia ─────────────────────────────────
// Census returns FIPS codes; this maps them back to county names.

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

function countyFromFips(stateFips, countyFips) {
  const code = countyFips.padStart(3, '0')
  return GA_COUNTY_FIPS[code] || `County ${code}`
}

// ─── API fetch ────────────────────────────────────────────────────────────────

async function fetchCensusData(dataset, year, variables, apiKey) {
  const vars = Object.values(variables).join(',')
  const params = new URLSearchParams({
    get: `NAME,${vars}`,
    for: 'county:*',
    in: `state:${GA_FIPS}`,
  })
  if (apiKey) params.set('key', apiKey)

  const url = `${CENSUS_BASE}/${year}/${dataset}?${params.toString()}`
  const resp = await fetch(url)

  // Census API redirects to missing_key.html when no key is provided (as of 2025)
  if (resp.url?.includes('missing_key') || resp.url?.includes('key_signup')) {
    throw new Error(
      'Census API key required. Get a free key at api.census.gov/data/key_signup.html and enter it above.'
    )
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Census API error ${resp.status}: ${body.slice(0, 200)}`)
  }

  let rows
  try {
    rows = await resp.json()
  } catch {
    throw new Error(
      'Census API key required or returned invalid response. Get a free key at api.census.gov/data/key_signup.html'
    )
  }

  if (!Array.isArray(rows)) {
    throw new Error('Census API returned unexpected format (expected JSON array)')
  }

  return { rows, url, year, dataset, variables }
}

// ─── Response normalization ───────────────────────────────────────────────────

function normalizeCensusRows(rows, variables, year) {
  if (!rows || rows.length < 2) return []
  const headers = rows[0]

  const popVar  = Object.values(variables)[0]
  const popIdx  = headers.indexOf(popVar)
  const nameIdx = headers.indexOf('NAME')
  const statIdx = headers.indexOf('state')
  const cntyIdx = headers.indexOf('county')

  return rows.slice(1).map(row => {
    const countyFips = row[cntyIdx]
    const stateFips  = row[statIdx]
    const countyName = countyFromFips(stateFips, countyFips)
    const fips       = `${stateFips}${countyFips.padStart(3, '0')}`
    const pop        = parseInt(row[popIdx], 10)

    return {
      county:      countyName,
      fips,
      year,
      population:  isNaN(pop) ? null : pop,
      source:      `U.S. Census ${year}`,
      censusDataset: rows[0]?.join(',') || 'unknown',
    }
  }).filter(r => r.county)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchCountyPopulation(datasetId, apiKey) {
  const ds = CENSUS_DATASETS.find(d => d.id === datasetId)
  if (!ds) throw new Error(`Unknown Census dataset: ${datasetId}`)

  const { rows, url, year, variables } = await fetchCensusData(
    ds.dataset, ds.year, ds.variables, apiKey
  )
  const normalized = normalizeCensusRows(rows, variables, year)

  return {
    records: normalized,
    sourceUrl: url,
    datasetId,
    datasetLabel: ds.label,
    recordCount: normalized.length,
    year: ds.year,
  }
}

// Fetch multiple Census years and return combined contextual records
export async function fetchAllPopulation(datasetIds, apiKey) {
  const results = []
  const errors  = []

  for (const id of datasetIds) {
    try {
      const result = await fetchCountyPopulation(id, apiKey)
      results.push(result)
    } catch (e) {
      errors.push({ datasetId: id, error: e.message })
    }
  }

  const allRecords = results.flatMap(r => r.records)
  return { records: allRecords, results, errors }
}

// Convert Census population records to contextual data format expected by electionStore
export function toContextualData(populationRecords) {
  const ctx = {}
  for (const r of populationRecords) {
    const key = `${r.county}::${r.year}`
    ctx[key] = {
      county:         r.county,
      year:           r.year,
      population:     r.population,
      fips:           r.fips,
      source:         r.source,
      // Registration fields left absent — Census does not provide voter registration.
      // Import registration data separately from Georgia SOS voter registration stats.
      totalRegistered: null,
      activeVoters:    null,
      note: 'Population from U.S. Census. Voter registration must be imported separately from Georgia SOS.',
    }
  }
  return ctx
}
