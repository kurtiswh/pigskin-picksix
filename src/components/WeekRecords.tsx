import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  Badge as RecordBadge, BadgeTier, StatKey, STATS, WeekRow, HISTORY_FIRST_SEASON,
  badgesFor, rankWeek, statValue, topWeeks, weekLabel,
} from '@/lib/weekRecords'

const TIER_CLASS: Record<BadgeTier, string> = {
  record: 'bg-[#8a6a1f] text-white',
  podium: 'bg-[#C9A04E] text-[#3a2a12]',
  top: 'bg-[#efe6d0] text-[#5a4310]',
  season: 'bg-[#4B3621] text-white',
}

/**
 * Badges for one stat, final weeks only. Tapping opens the all-time list.
 * Renders nothing when the week ranks outside the top 10 and isn't a season best.
 */
export function StatRecordBadges({ stat, weeks, current, showRecordLine = true, align = 'center' }: {
  stat: StatKey
  weeks: WeekRow[]
  current: WeekRow
  showRecordLine?: boolean
  align?: 'center' | 'start'
}) {
  const [open, setOpen] = useState(false)
  const ranking = rankWeek(stat, weeks, current)
  const badges = badgesFor(ranking)
  if (badges.length === 0) return null
  const def = STATS[stat]
  const best = ranking.best
  const recordLine = best
    ? <>{ranking.rank === 1 ? 'Old record' : 'Record'}: {def.format(statValue(best, stat))} <span className="whitespace-nowrap">({weekLabel(best)})</span></>
    : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mt-1 flex flex-col gap-0.5 ${align === 'start' ? 'items-start' : 'items-center'} w-full`}
        aria-label={`${badges.map(b => b.text).join(', ')}. Show the all-time list for ${def.label}`}
      >
        <span className={`flex flex-wrap gap-1 ${align === 'start' ? 'justify-start' : 'justify-center'}`}>
          {badges.map(b => <BadgeChip key={b.text} badge={b} />)}
        </span>
        {showRecordLine && recordLine && <span className="text-[10.5px] text-charcoal-500">{recordLine}</span>}
      </button>
      <RecordListDialog open={open} onOpenChange={setOpen} stat={stat} weeks={weeks} current={current} />
    </>
  )
}

function BadgeChip({ badge }: { badge: RecordBadge }) {
  return (
    <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${TIER_CLASS[badge.tier]}`}>
      {badge.text}
    </span>
  )
}

/** "Record week" banner: one line per all-time record set (final weeks only). */
export function RecordWeekBanner({ weeks, current }: { weeks: WeekRow[]; current: WeekRow }) {
  const records = (Object.keys(STATS) as StatKey[])
    .map(stat => ({ stat, ranking: rankWeek(stat, weeks, current) }))
    .filter(({ ranking }) => ranking.rank === 1)
  if (records.length === 0) return null

  return (
    <div className="rounded-lg bg-[#fff8e6] border border-[#ecd59a] px-3 py-2.5 flex gap-2.5 items-start">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8a6a1f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
        <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
        <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
      </svg>
      <div className="flex flex-col gap-0.5 text-sm">
        <span className="font-bold text-[#4B3621]">Record week</span>
        {records.map(({ stat, ranking }) => {
          const def = STATS[stat]
          const old = ranking.best
          return (
            <span key={stat} className="text-[13px] text-[#4a3a22] leading-snug">
              {recordSentence(stat, statValue(current, stat), ranking.tied)}
              {old && <> {ranking.tied ? 'Matches' : 'Old record:'} {def.format(statValue(old, stat))} ({weekLabel(old)}).</>}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function recordSentence(stat: StatKey, v: number, tied: boolean): string {
  const most = tied ? 'tied for the most' : 'the most'
  const best = tied ? 'tied for the best' : 'the best'
  const since = `since ${HISTORY_FIRST_SEASON}`
  switch (stat) {
    case 'perfect': return `${v} perfect 6-0 weeks, ${most} in any week ${since}.`
    case 'over100': return `${v} players scored over 100, ${most} in any week ${since}.`
    case 'avg': return `Average score of ${v.toFixed(1)}, ${best} of any week ${since}.`
    case 'winPct': return `Everyone's picks hit ${v.toFixed(1)}% ATS, ${best} of any week ${since}.`
    case 'lockPct': return `Locks hit ${v.toFixed(1)}%, ${best} of any week ${since}.`
  }
}

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
      <p className="text-[11px] text-charcoal-500">Badges for the other stats appear once every game is final.</p>
    </div>
  )
}

function RecordListDialog({ open, onOpenChange, stat, weeks, current }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  stat: StatKey
  weeks: WeekRow[]
  current: WeekRow
}) {
  const def = STATS[stat]
  const list = topWeeks(stat, weeks, 5)
  const inList = list.some(x => x.row === current)
  const currentRanking = rankWeek(stat, weeks, current)
  const share = (r: WeekRow) => (r.entries ? `${((100 * statValue(r, stat)) / r.entries).toFixed(1)}%` : '—')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#4B3621]">{def.listTitle}</DialogTitle>
          <DialogDescription>Every week since {HISTORY_FIRST_SEASON} · {currentRanking.totalWeeks} weeks</DialogDescription>
        </DialogHeader>
        <div className="border border-[#ece7de] rounded-lg overflow-hidden text-sm">
          <div className={`grid ${def.isCount ? 'grid-cols-[40px_minmax(0,1fr)_56px_64px]' : 'grid-cols-[40px_minmax(0,1fr)_72px]'} gap-2 px-3 py-2 bg-[#faf8f4] text-[10.5px] font-bold uppercase tracking-wide text-charcoal-500`}>
            <span>#</span><span>Week</span><span className="text-right">{def.isCount ? 'Count' : 'Value'}</span>{def.isCount && <span className="text-right">Of field</span>}
          </div>
          {list.map(({ row, rank, value }) => {
            const isCurrent = row === current
            const tiedRank = list.filter(x => x.rank === rank).length > 1
            return (
              <div key={`${row.season}-${row.week}`}
                className={`grid ${def.isCount ? 'grid-cols-[40px_minmax(0,1fr)_56px_64px]' : 'grid-cols-[40px_minmax(0,1fr)_72px]'} gap-2 px-3 py-2 border-t border-[#f0ece5] items-center ${isCurrent ? 'bg-[#fbf4e3] font-semibold text-[#4B3621]' : ''}`}>
                <span className={rank <= 3 ? 'font-extrabold text-[#8a6a1f]' : 'text-charcoal-500'}>{tiedRank ? 'T' : ''}{rank}</span>
                <span>{weekLabel(row)}{isCurrent ? ' · this week' : ''}</span>
                <span className="text-right tabular-nums font-bold">{def.format(value)}</span>
                {def.isCount && <span className="text-right tabular-nums text-charcoal-500">{share(row)}</span>}
              </div>
            )
          })}
          {!inList && (
            <div className={`grid ${def.isCount ? 'grid-cols-[40px_minmax(0,1fr)_56px_64px]' : 'grid-cols-[40px_minmax(0,1fr)_72px]'} gap-2 px-3 py-2 border-t border-[#ecd59a] items-center bg-[#fbf4e3] font-semibold text-[#4B3621]`}>
              <span>{currentRanking.rank}</span>
              <span>{weekLabel(current)} · this week</span>
              <span className="text-right tabular-nums font-bold">{def.format(statValue(current, stat))}</span>
              {def.isCount && <span className="text-right tabular-nums text-charcoal-500">{share(current)}</span>}
            </div>
          )}
        </div>
        {def.isCount && (
          <p className="text-xs text-charcoal-500">
            Ranked by raw count. The field has grown, so "Of field" shows each week's share for context.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
