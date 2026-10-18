import { useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  StatKey, STATS, WeekRow, HISTORY_FIRST_SEASON,
  highlights, rankWeek, statValue, topWeeks, weekLabel,
} from '@/lib/weekRecords'

export interface WatchItem {
  stat: 'perfect' | 'over100'
  now: number
  possible: number      // if every still-alive entry gets there
  chasing: number       // entries still able to get there
}

/**
 * Live "Record watch": only for count stats whose best case still reaches the
 * all-time top 3, so a quiet week shows nothing.
 */
export function RecordWatch({ items, weeks, current }: { items: WatchItem[]; weeks: WeekRow[]; current: WeekRow }) {
  const shown = items.map(item => {
    const vals = weeks.filter(r => r !== current).map(r => statValue(r, item.stat)).sort((a, b) => b - a)
    const record = vals[0] ?? 0
    const third = vals[Math.min(2, vals.length - 1)] ?? Infinity
    const recordRow = weeks.find(r => r !== current && statValue(r, item.stat) === record) || null
    const bestRank = 1 + vals.filter(v => v > item.possible).length
    return { item, record, recordRow, bestRank, third }
  }).filter(x => x.item.possible >= x.third)

  if (shown.length === 0) return null
  const otherVals = (stat: WatchItem['stat']) => weeks.filter(r => r !== current).map(r => statValue(r, stat))

  return (
    <div className="rounded-lg bg-white border border-[#ecd59a] px-3 py-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#c0392b] animate-pulse" aria-hidden="true" />
          <span className="text-xs font-bold uppercase tracking-wide text-[#4B3621]">Record watch</span>
        </span>
        <span className="text-[11px] text-charcoal-500">Updates every minute</span>
      </div>
      {shown.map(({ item, record, recordRow, bestRank }) => {
        const scale = Math.max(item.possible, record, 1)
        const nowPct = (item.now / scale) * 100
        const possiblePct = (item.possible / scale) * 100
        const recordPct = (record / scale) * 100
        const name = item.stat === 'perfect' ? 'Perfect 6-0 weeks' : 'Entries over 100 points'
        const already = item.stat === 'perfect' ? 'already 6-0' : 'already over 100'
        const alive = item.stat === 'perfect' ? 'still unbeaten' : 'can still get there'
        const outcome =
          item.possible > record ? `${item.possible - record} more than the all-time record`
          : item.possible === record ? 'would tie the all-time record'
          : `would ${otherVals(item.stat).includes(item.possible) ? 'tie for' : 'rank'} #${bestRank} all-time`
        const passed = item.now > record
        return (
          <div key={item.stat} className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-charcoal-800">{name}</span>
            <div className="relative h-3 rounded-full bg-[#f0ece5]" role="img"
              aria-label={`${item.now} ${already}, up to ${item.possible} possible, record ${record}`}>
              <div className="absolute inset-y-0 left-0 rounded-full bg-[#a8d5b8]" style={{ width: `${possiblePct}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-[#1f7a44]" style={{ width: `${nowPct}%` }} />
              <div className="absolute -inset-y-0.5 w-0.5 bg-[#4B3621]" style={{ left: `calc(${recordPct}% - 1px)` }} />
            </div>
            <div className="flex justify-between gap-2 text-[11.5px] text-charcoal-600">
              <span><b className="text-[#1f7a44]">{item.now}</b> {already} · <b className="text-[#2f7a52]">{item.chasing}</b> {alive}</span>
              <span className="shrink-0">Record <b className="text-[#4B3621]">{record}</b></span>
            </div>
            <p className="text-[12.5px] leading-snug text-charcoal-700 bg-[#f3faf5] border border-[#cfe8d8] rounded-md px-2.5 py-1.5">
              {passed
                ? <>Already past the record of {record}{recordRow ? ` (${weekLabel(recordRow)})` : ''}.</>
                : <>If all {item.chasing} get there, that's <b>{item.possible}</b>, {outcome}{recordRow && item.possible >= record ? ` (${weekLabel(recordRow)})` : ''}.</>}
            </p>
          </div>
        )
      })}
      <p className="text-[11px] text-charcoal-500">Full stats and the record book update once every game is final.</p>
    </div>
  )
}

/**
 * One tappable line when the week is final: "Record week: 147 over 100
 * (all-time record) · 26 perfect (#2 all-time) · +3 more". Nothing for an
 * ordinary week. The full breakdown is one tap away.
 */
export function RecordHeadline({ weeks, current }: { weeks: WeekRow[]; current: WeekRow }) {
  const [open, setOpen] = useState(false)
  const list = highlights(weeks, current)
  if (list.length === 0) return null
  const isRecord = list[0].ranking.rank === 1
  const lead = isRecord ? 'Record week' : list[0].ranking.rank <= 10 ? 'For the record books' : 'Season highs'
  const shown = list.slice(0, 2)
  const more = list.length - shown.length

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full text-left rounded-lg px-3 py-2.5 flex items-start gap-2.5 border ${isRecord ? 'bg-[#fff8e6] border-[#ecd59a]' : 'bg-[#faf8f4] border-[#f0ece5]'} hover:border-[#C9A04E]`}
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8a6a1f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
          <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
          <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
        </svg>
        <span className="flex-1 min-w-0 text-sm leading-snug">
          <span className="font-bold text-[#4B3621]">{lead}: </span>
          <span className="text-[#4a3a22]">{shown.map(h => h.short).join(' · ')}</span>
          {more > 0 && <span className="text-charcoal-500"> · +{more} more</span>}
        </span>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8a6a1f" strokeWidth="2.2" strokeLinecap="round" className="shrink-0 mt-0.5"><path d="M9 6l6 6-6 6" /></svg>
      </button>
      <WeekRecordsDialog open={open} onOpenChange={setOpen} weeks={weeks} current={current} initialStat={list[0].stat} />
    </>
  )
}

/** Every stat's rank, plus the all-time top 5 for whichever stat is selected. */
function WeekRecordsDialog({ open, onOpenChange, weeks, current, initialStat }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  weeks: WeekRow[]
  current: WeekRow
  initialStat: StatKey
}) {
  const [stat, setStat] = useState<StatKey>(initialStat)
  const def = STATS[stat]
  const list = topWeeks(stat, weeks, 5)
  const inList = list.some(x => x.row === current)
  const selected = rankWeek(stat, weeks, current)
  const share = (r: WeekRow) => (r.entries ? `${((100 * statValue(r, stat)) / r.entries).toFixed(1)}%` : '—')
  const cols = def.isCount ? 'grid-cols-[36px_minmax(0,1fr)_52px_60px]' : 'grid-cols-[36px_minmax(0,1fr)_68px]'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#4B3621]">Week {current.week} in the record books</DialogTitle>
          <DialogDescription>Ranked against every week since {HISTORY_FIRST_SEASON} ({selected.totalWeeks} weeks). Tap a stat for its all-time list.</DialogDescription>
        </DialogHeader>

        <div className="border border-[#ece7de] rounded-lg overflow-hidden text-sm">
          {(Object.keys(STATS) as StatKey[]).map(k => {
            const r = rankWeek(k, weeks, current)
            const active = k === stat
            return (
              <button key={k} type="button" onClick={() => setStat(k)}
                className={`w-full grid grid-cols-[minmax(0,1fr)_64px_92px] gap-2 px-3 py-2.5 text-left border-t first:border-t-0 border-[#f0ece5] items-center ${active ? 'bg-[#fbf4e3]' : 'hover:bg-[#faf8f4]'}`}>
                <span className={active ? 'font-semibold text-[#4B3621]' : ''}>{STATS[k].label}</span>
                <span className="text-right tabular-nums font-bold">{STATS[k].format(statValue(current, k))}</span>
                <span className={`text-right text-xs ${r.rank <= 3 ? 'font-bold text-[#8a6a1f]' : 'text-charcoal-500'}`}>
                  {r.rank === 1 ? 'All-time #1' : `#${r.rank} all-time`}
                  {r.rank !== 1 && r.seasonWeeks >= 3 && r.seasonRank === 1 ? <span className="block text-[10.5px] text-[#4B3621]">Season best</span> : null}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold text-[#4B3621]">{def.listTitle}</span>
          <div className="border border-[#ece7de] rounded-lg overflow-hidden text-sm">
            <div className={`grid ${cols} gap-2 px-3 py-2 bg-[#faf8f4] text-[10.5px] font-bold uppercase tracking-wide text-charcoal-500`}>
              <span>#</span><span>Week</span><span className="text-right">{def.isCount ? 'Count' : 'Value'}</span>{def.isCount && <span className="text-right">Of field</span>}
            </div>
            {list.map(({ row, rank, value }) => {
              const isCurrent = row === current
              const tiedRank = list.filter(x => x.rank === rank).length > 1
              return (
                <div key={`${row.season}-${row.week}`}
                  className={`grid ${cols} gap-2 px-3 py-2 border-t border-[#f0ece5] items-center ${isCurrent ? 'bg-[#fbf4e3] font-semibold text-[#4B3621]' : ''}`}>
                  <span className={rank <= 3 ? 'font-extrabold text-[#8a6a1f]' : 'text-charcoal-500'}>{tiedRank ? 'T' : ''}{rank}</span>
                  <span>{weekLabel(row)}{isCurrent ? ' · this week' : ''}</span>
                  <span className="text-right tabular-nums font-bold">{def.format(value)}</span>
                  {def.isCount && <span className="text-right tabular-nums text-charcoal-500">{share(row)}</span>}
                </div>
              )
            })}
            {!inList && (
              <div className={`grid ${cols} gap-2 px-3 py-2 border-t border-[#ecd59a] items-center bg-[#fbf4e3] font-semibold text-[#4B3621]`}>
                <span>{selected.rank}</span>
                <span>{weekLabel(current)} · this week</span>
                <span className="text-right tabular-nums font-bold">{def.format(statValue(current, stat))}</span>
                {def.isCount && <span className="text-right tabular-nums text-charcoal-500">{share(current)}</span>}
              </div>
            )}
          </div>
          {def.isCount && (
            <p className="text-xs text-charcoal-500">Ranked by raw count. The field has grown, so "Of field" shows each week's share for context.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export interface MyWeek {
  wins: number
  losses: number
  pushes: number
  points: number
  pending: number
}

/**
 * The viewer's own line. Live: where you stand and what's left. Final: where
 * you finished, and for a 6-0 card how rare this week's crop of them was.
 */
export function MyWeekLine({ me, field, live, weeks, current }: {
  me: MyWeek
  field: MyWeek[]
  live: boolean
  weeks: WeekRow[]
  current: WeekRow
}) {
  const rec = `${me.wins}-${me.losses}${me.pushes ? `-${me.pushes}` : ''}`
  const rank = 1 + field.filter(f => f.points > me.points).length
  const beat = field.length > 1 ? Math.floor((100 * field.filter(f => f.points < me.points).length) / (field.length - 1)) : 0
  let text: ReactNode

  if (live && me.pending > 0) {
    const unbeaten = me.losses === 0 && me.pushes === 0
    const othersUnbeaten = field.filter(f => f.losses === 0 && f.pushes === 0 && (f.pending > 0 || f.wins === 6)).length - (unbeaten ? 1 : 0)
    text = unbeaten
      ? <>You're <b>{rec}</b> with {me.pending} to play. {othersUnbeaten} other{othersUnbeaten === 1 ? '' : 's'} still perfect.</>
      : <>You're <b>{rec}</b> with {me.pending} to play: <b>{me.points}</b> pts so far, #{rank} of {field.length}.</>
  } else if (me.wins === 6 && me.losses === 0 && me.pushes === 0) {
    const r = rankWeek('perfect', weeks, current)
    const where = r.rank === 1 ? `the most of any week since ${HISTORY_FIRST_SEASON}` : r.rank <= 10 ? `#${r.rank} among all weeks since ${HISTORY_FIRST_SEASON}` : null
    text = <>You went <b>6-0</b> for <b>{me.points}</b> pts, one of {current.perfect} perfect cards{where ? <> ({where})</> : null}.</>
  } else {
    text = <>{live ? "You're done: " : 'You finished '}<b>{rec}</b>, <b>{me.points}</b> pts. #{rank} of {field.length}{field.length > 1 ? <>, better than {beat}% of the field</> : null}{live ? ' so far' : ''}.</>
  }

  return (
    <div className="rounded-lg bg-[#fbf4e3] border border-[#ecd59a] px-3 py-2 text-sm text-[#3a2a12] leading-snug">
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-[#8a6a1f] mr-1.5">Your week</span>
      {text}
    </div>
  )
}
