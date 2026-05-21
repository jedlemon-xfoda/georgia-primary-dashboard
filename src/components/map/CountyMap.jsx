import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import * as topojson from 'topojson-client'
import { fmt } from '../../utils/formatters.js'

const US_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json'
const GEORGIA_STATE_FIPS = '13'

function countyColor(data, fips) {
  if (!data || !fips) return '#1e2d4f'
  const d = data[fips]
  if (!d || d.shift == null) return '#1e2d4f'
  const shift = d.shift  // positive = R gained, negative = D gained

  if (d.severity === 'RED') {
    return shift > 0 ? '#7f1d1d' : '#1e3a5f'
  }

  if (Math.abs(shift) < 0.01) return '#2d2a4a'  // purple (minimal)

  const intensity = Math.min(1, Math.abs(shift) / 0.15)
  if (shift > 0) {
    // Red scale
    const r = Math.round(100 + intensity * 155)
    const g = Math.round(30  - intensity * 10)
    const b = Math.round(30  - intensity * 10)
    return `rgb(${r},${g},${b})`
  } else {
    // Blue scale
    const r = Math.round(30  - intensity * 10)
    const g = Math.round(60  - intensity * 30)
    const b = Math.round(100 + intensity * 155)
    return `rgb(${r},${g},${b})`
  }
}

export default function CountyMap({ countyData = [], onCountyClick, selectedCounty }) {
  const svgRef   = useRef(null)
  const [geo, setGeo]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)
  const [tooltip, setTooltip] = useState(null)

  // Build fips → data lookup
  const dataByFips = Object.fromEntries(
    countyData.map(c => [c.fips, c]).filter(([f]) => f)
  )

  useEffect(() => {
    fetch(US_ATLAS_URL)
      .then(r => { if (!r.ok) throw new Error('Failed to fetch map data'); return r.json() })
      .then(us => {
        const gaCounties = {
          type: 'GeometryCollection',
          geometries: us.objects.counties.geometries.filter(
            d => String(d.id).padStart(5, '0').startsWith(GEORGIA_STATE_FIPS)
          )
        }
        setGeo({ us, gaCounties })
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const drawMap = useCallback(() => {
    if (!geo || !svgRef.current) return
    const container = svgRef.current.parentElement
    const width  = container.clientWidth || 600
    const height = Math.round(width * 0.78)
    const svg = d3.select(svgRef.current)
    svg.attr('width', width).attr('height', height)
    svg.selectAll('*').remove()

    const features = topojson.feature(geo.us, geo.gaCounties)

    const projection = d3.geoAlbers()
      .fitExtent([[20, 20], [width - 20, height - 20]], features)

    const path = d3.geoPath().projection(projection)

    const g = svg.append('g')

    g.selectAll('path')
      .data(features.features)
      .join('path')
      .attr('class', 'county-path')
      .attr('d', path)
      .attr('fill', d => {
        const fips = String(d.id).padStart(5, '0')
        if (selectedCounty && dataByFips[fips]?.county === selectedCounty) return '#6366f1'
        return countyColor(dataByFips, fips)
      })
      .attr('stroke', '#0c1428')
      .attr('stroke-width', 0.6)
      .on('mousemove', (event, d) => {
        const fips  = String(d.id).padStart(5, '0')
        const data  = dataByFips[fips]
        if (data) {
          setTooltip({
            x: event.offsetX,
            y: event.offsetY,
            county: data.county,
            rShare: data.rShare,
            dShare: data.dShare,
            total: data.total,
            shift: data.shift,
            baseline: data.baseline,
            severity: data.severity,
          })
        }
      })
      .on('mouseleave', () => setTooltip(null))
      .on('click', (event, d) => {
        const fips = String(d.id).padStart(5, '0')
        const data = dataByFips[fips]
        if (data && onCountyClick) onCountyClick(data.county)
      })

    // State outline
    const gaState = topojson.feature(geo.us, {
      type: 'GeometryCollection',
      geometries: geo.us.objects.states.geometries.filter(
        d => String(d.id).padStart(2, '0') === GEORGIA_STATE_FIPS
      )
    })
    g.append('path')
      .datum(gaState.features[0] || gaState)
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', '#6366f1')
      .attr('stroke-width', 1.5)
  }, [geo, dataByFips, selectedCounty, onCountyClick])

  useEffect(() => { drawMap() }, [drawMap])

  useEffect(() => {
    const handleResize = () => drawMap()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [drawMap])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-500 text-sm gap-2">
      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      Loading county map data…
    </div>
  )

  if (error) return (
    <div className="p-4 text-sm text-red-400 bg-red-900/20 rounded-lg">
      Map unavailable: {error}. Ensure network access to cdn.jsdelivr.net.
    </div>
  )

  return (
    <div className="relative w-full select-none">
      <svg ref={svgRef} className="w-full" />

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 bg-navy-800 border border-navy-500 rounded-lg p-3 text-xs shadow-xl"
          style={{ left: Math.min(tooltip.x + 12, 400), top: Math.max(0, tooltip.y - 80) }}
        >
          <div className="font-semibold text-slate-200 mb-2">{tooltip.county} County</div>
          <div className="space-y-1 text-slate-400">
            <div className="flex justify-between gap-4">
              <span className="text-red-400">Republican ballot share</span>
              <span className="text-slate-200">{fmt.pct(tooltip.rShare)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-blue-400">Democratic ballot share</span>
              <span className="text-slate-200">{fmt.pct(tooltip.dShare)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Total ballots</span>
              <span className="text-slate-200">{fmt.number(tooltip.total)}</span>
            </div>
            {tooltip.shift != null && (
              <div className="flex justify-between gap-4 pt-1 border-t border-navy-600">
                <span>Shift vs. baseline</span>
                <span className={`font-medium ${tooltip.shift > 0.01 ? 'text-red-400' : tooltip.shift < -0.01 ? 'text-blue-400' : 'text-slate-400'}`}>
                  {fmt.pctPts(tooltip.shift)}
                </span>
              </div>
            )}
            {tooltip.severity !== 'GREEN' && (
              <div className={`mt-1.5 text-xs font-medium ${tooltip.severity === 'RED' ? 'text-red-400' : 'text-amber-400'}`}>
                ⚠ {tooltip.severity} deviation flag
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-navy-900/90 border border-navy-500 rounded-lg p-2 text-xs space-y-1">
        <div className="text-slate-500 font-medium mb-1">Ballot Share Shift</div>
        {[
          { color: 'bg-red-700',   label: 'R share gained' },
          { color: 'bg-[#2d2a4a]',label: 'Minimal shift' },
          { color: 'bg-blue-700',  label: 'D share gained' },
          { color: 'bg-indigo-600',label: 'Selected county' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-sm ${color}`} />
            <span className="text-slate-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
