import { HISTORY_ROWS, HISTORY_FIRST_SEASON, StatKey, STATS, WeekRow, rankWeek, statValue } from '@/lib/weekRecords'

/**
 * Charts for the week overview: how the field's scores spread out, and how a
 * stat has moved week to week this season. Plain inline SVG/divs, no library.
 */

// Score buckets: integer points, edges chosen so the last two bars are exactly "over 100"
const BUCKETS = [
  { label: '0', min: -Infinity, max: 20 },
  { label: '21', min: 21, max: 40 },
  { label: '41', min: 41, max: 60 },
  { label: '61', min: 61, max: 80 },
  { label: '81', min: 81, max: 100 },
  { label: '101', min: 101, max: 120 },
  { label: '121+', min: 121, max: Infinity },
]

export function ScoreHistogram({ points, myPoints, live }: {
  points: number[]
  myPoints?: number
  live: boolean
}) {
  if (points.length === 0) return null
  const counts = BUCKETS.map(b => points.filter(p => p >= b.min && p <= b.max).length)
  const max = Math.max(...counts, 1)
  const mine = myPoints == null ? -1 : BUCKETS.findIndex(b => myPoints >= b.min && myPoints <= b.max)
  const sorted = [...points].sort((a, b) => a - b)
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  const over100 = counts[5] + counts[6]
  const range = (i: number) => (i === BUCKETS.length - 1 ? '121+' : `${BUCKETS[i].label}-${BUCKETS[i].max}`)

  return (
    <div className="rounded-lg bg-[#faf8f4] border border-[#f0ece5] px-3 py-3 flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-[#4B3621]">How the field scored{live ? ' so far' : ''}</span>
        <span className="text-[11px] text-charcoal-500 tabular-nums">median {median}</span>
      </div>
      <div
        className="grid grid-cols-7 gap-1.5 items-end h-32 border-b border-[#e3ddd2]"
        role="img"
        aria-label={`Scores: ${BUCKETS.map((_, i) => `${range(i)}: ${counts[i]}`).join(', ')}${mine >= 0 ? `. Your score is in ${range(mine)}.` : ''}`}
      >
        {counts.map((n, i) => {
          const isMine = i === mine
          const isOver = i >= 5
          const bar = isMine ? 'bg-[#C9A04E] ring-2 ring-inset ring-[#4B3621]' : isOver ? 'bg-[#e7b97a]' : 'bg-[#d6cbb5]'
          return (
            <div key={i} className="flex flex-col items-center justify-end gap-0.5 h-full min-w-0">
              {isMine && <span className="text-[9.5px] font-bold text-white bg-[#4B3621] px-1.5 rounded-full">You</span>}
              <span className={`text-[10px] tabular-nums ${isMine || isOver ? 'font-bold text-[#8a5a12]' : 'text-charcoal-500'}`}>{n}</span>
              <div className={`w-full rounded-t ${bar}`} style={{ height: `${Math.max(n ? 3 : 0, (n / max) * 92)}px` }} />
            </div>
          )
        })}
      </div>
      {/* Each bar is labeled with where its range starts: 0, 21, 41 ... 121+ */}
      <div className="grid grid-cols-7 gap-1.5 text-[9.5px] text-charcoal-500 text-center tabular-nums">
        {BUCKETS.map(b => <span key={b.label}>{b.label}</span>)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-charcoal-600">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#e7b97a]" aria-hidden="true" />Over 100 ({over100})</span>
        {mine >= 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#C9A04E] ring-1 ring-[#4B3621]" aria-hidden="true" />Your {myPoints}</span>}
      </div>
    </div>
  )
}

/** This season's weeks in order, with the week being viewed marked. */
export function seasonSeries(weeks: WeekRow[], current: WeekRow, stat: StatKey) {
  return weeks
    .filter(r => r.season === current.season && r.entries > 0)
    .sort((a, b) => a.week - b.week)
    .map(r => ({ week: r.week, value: statValue(r, stat), isCurrent: r === current }))
}

/** Tiny trend line for a tile. The viewed week is the larger dot (hollow while live). */
export function MiniTrend({ series, color, live }: {
  series: { week: number; value: number; isCurrent: boolean }[]
  color: string
  live: boolean
}) {
  if (series.length < 2) return null
  const W = 96, H = 26, PAD = 3
  const vals = series.map(s => s.value)
  const lo = Math.min(...vals), hi = Math.max(...vals)
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (series.length - 1)
  const y = (v: number) => H - PAD - (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * (H - 2 * PAD)
  const cur = series.findIndex(s => s.isCurrent)
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="block max-w-[96px] mx-auto">
      <polyline fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" opacity="0.8"
        points={series.map((s, i) => `${x(i)},${y(s.value)}`).join(' ')} />
      {cur >= 0 && (
        <circle cx={x(cur)} cy={y(series[cur].value)} r="3" fill={live ? '#fff' : color} stroke={color} strokeWidth="1.6" />
      )}
    </svg>
  )
}

/**
 * Full chart for one stat: this season by week, against a typical week since
 * 2016 and the all-time record.
 */
export function TrendChart({ stat, weeks, current, live }: {
  stat: StatKey
  weeks: WeekRow[]
  current: WeekRow
  live: boolean
}) {
  const series = seasonSeries(weeks, current, stat)
  if (series.length === 0) return null
  const def = STATS[stat]
  const hist = HISTORY_ROWS.map(r => statValue(r, stat))
  const typical = hist.reduce((a, b) => a + b, 0) / Math.max(1, hist.length)
  const best = rankWeek(stat, weeks, current).best
  const record = best ? statValue(best, stat) : null

  const W = 320, H = 120, L = 6, R = 6, T = 16, B = 18
  const vals = [...series.map(s => s.value), typical, ...(record != null ? [record] : [])]
  const lo = Math.min(...vals) * 0.95, hi = Math.max(...vals) * 1.03
  const x = (i: number) => L + (series.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (series.length - 1))
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B)
  const cur = series.findIndex(s => s.isCurrent)
  const fmt = def.format

  return (
    <div className="rounded-lg bg-white border border-[#ecd59a] px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-sm font-bold text-[#4B3621]">{def.label} by week, {current.season}</span>
        {cur >= 0 && <span className="text-[11px] text-charcoal-500">Wk {current.week}: <b className="text-[#4B3621]">{fmt(series[cur].value)}</b>{live ? ' so far' : ''}</span>}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`${def.label} by week: ${series.map(s => `week ${s.week} ${fmt(s.value)}`).join(', ')}. Typical week since ${HISTORY_FIRST_SEASON}: ${fmt(typical)}.${record != null ? ` Record: ${fmt(record)}.` : ''}`}>
        {record != null && (
          <>
            <line x1={L} x2={W - R} y1={y(record)} y2={y(record)} stroke="#C9A04E" strokeWidth="1.5" strokeDasharray="2 3" />
          </>
        )}
        <line x1={L} x2={W - R} y1={y(typical)} y2={y(typical)} stroke="#b9b0a0" strokeWidth="1.5" strokeDasharray="5 3" />
        <polyline fill="none" stroke="#4B3621" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
          points={series.map((s, i) => `${x(i)},${y(s.value)}`).join(' ')} />
        {series.map((s, i) => (
          <g key={s.week}>
            <circle cx={x(i)} cy={y(s.value)} r={s.isCurrent ? 5 : 2.5}
              fill={s.isCurrent ? (live ? '#fff' : '#C9A04E') : '#4B3621'} stroke="#4B3621" strokeWidth={s.isCurrent ? 2 : 0} />
            <text x={x(i)} y={H - 4} textAnchor="middle" fontSize="9.5" fill={s.isCurrent ? '#4B3621' : '#7a7a7a'} fontWeight={s.isCurrent ? 700 : 400}>{s.week}</text>
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[11px] text-charcoal-600">
        <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-[#b9b0a0]" aria-hidden="true" />Typical week since {HISTORY_FIRST_SEASON}: {fmt(typical)}</span>
        {record != null && <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dotted border-[#C9A04E]" aria-hidden="true" />All-time record: {fmt(record)}</span>}
      </div>
    </div>
  )
}
