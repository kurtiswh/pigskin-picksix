import history from '@/data/weekRecordsHistory.json'

/**
 * Week-level records: how a week's stats rank against every week since 2016.
 *
 * Completed seasons come from a frozen file (src/data/weekRecordsHistory.json);
 * the current season is summarized live from weekly_leaderboard. Ranking runs
 * over both, so "all-time" always includes this season's earlier weeks.
 */

export interface WeekRow {
  season: number
  week: number
  entries: number
  perfect: number      // 6-0-0
  zero: number         // 0-6-0
  over100: number      // total_points > 100 (matches the ">100 Points" tile)
  points: number       // sum of total_points
  wins: number
  losses: number
  lockWins: number
  lockLosses: number
}

/** One weekly_leaderboard row, as far as the summaries need it */
export interface EntryRow {
  week: number
  picks_made?: number | null
  wins?: number | null
  losses?: number | null
  pushes?: number | null
  total_points?: number | null
  lock_wins?: number | null
  lock_losses?: number | null
}

export const HISTORY_ROWS: WeekRow[] = (history.rows as number[][]).map(r => ({
  season: r[0], week: r[1], entries: r[2], perfect: r[3], zero: r[4], over100: r[5],
  points: r[6], wins: r[7], losses: r[8], lockWins: r[9], lockLosses: r[10]
}))
export const HISTORY_FIRST_SEASON = history.seasons[0]
export const HISTORY_LAST_SEASON = history.seasons[1]

/** Summarize one week's entries (only those that made picks). */
export function summarizeWeek(season: number, week: number, entries: EntryRow[]): WeekRow {
  const row: WeekRow = { season, week, entries: 0, perfect: 0, zero: 0, over100: 0, points: 0, wins: 0, losses: 0, lockWins: 0, lockLosses: 0 }
  for (const e of entries) {
    if ((e.picks_made ?? 0) <= 0 && (e.wins ?? 0) + (e.losses ?? 0) + (e.pushes ?? 0) <= 0) continue
    const w = e.wins || 0, l = e.losses || 0, p = e.pushes || 0, pts = e.total_points || 0
    row.entries++
    if (w === 6 && l === 0 && p === 0) row.perfect++
    if (w === 0 && l === 6 && p === 0) row.zero++
    if (pts > 100) row.over100++
    row.points += pts
    row.wins += w
    row.losses += l
    row.lockWins += e.lock_wins || 0
    row.lockLosses += e.lock_losses || 0
  }
  return row
}

/** Group a season's entries into per-week summaries. */
export function summarizeSeason(season: number, entries: EntryRow[]): WeekRow[] {
  const byWeek = new Map<number, EntryRow[]>()
  for (const e of entries) {
    if (!byWeek.has(e.week)) byWeek.set(e.week, [])
    byWeek.get(e.week)!.push(e)
  }
  return [...byWeek.entries()].map(([week, rows]) => summarizeWeek(season, week, rows))
}

export type StatKey = 'perfect' | 'over100' | 'avg' | 'winPct' | 'lockPct'

export const STATS: Record<StatKey, { label: string; listTitle: string; isCount: boolean; format: (v: number) => string }> = {
  perfect: { label: 'Perfect 6-0', listTitle: 'Most perfect 6-0 weeks', isCount: true, format: v => String(v) },
  over100: { label: '>100 points', listTitle: 'Most entries over 100 points', isCount: true, format: v => String(v) },
  avg: { label: 'Average score', listTitle: 'Highest average score', isCount: false, format: v => v.toFixed(1) },
  winPct: { label: 'Picks ATS', listTitle: 'Best week for everyone’s picks', isCount: false, format: v => `${v.toFixed(1)}%` },
  lockPct: { label: 'Locks', listTitle: 'Best week for Locks', isCount: false, format: v => `${v.toFixed(1)}%` },
}

/** Stat value, rounded to what's displayed so on-screen ties rank as ties. */
export function statValue(row: WeekRow, key: StatKey): number {
  const r1 = (x: number) => Math.round(x * 10) / 10
  switch (key) {
    case 'perfect': return row.perfect
    case 'over100': return row.over100
    case 'avg': return row.entries ? r1(row.points / row.entries) : 0
    case 'winPct': return row.wins + row.losses ? r1((100 * row.wins) / (row.wins + row.losses)) : 0
    case 'lockPct': return row.lockWins + row.lockLosses ? r1((100 * row.lockWins) / (row.lockWins + row.lockLosses)) : 0
  }
}

export const weekLabel = (r: { season: number; week: number }) => `${r.season}, Wk ${r.week}`

/**
 * Every week to rank against: history plus this season's weeks, with the week
 * being viewed taken from `current` (live) rather than any stale copy.
 */
export function allWeeks(seasonRows: WeekRow[], current: WeekRow): WeekRow[] {
  const others = [
    ...HISTORY_ROWS.filter(r => r.season !== current.season),
    ...seasonRows.filter(r => !(r.season === current.season && r.week === current.week)),
  ]
  return [...others, current]
}

export interface Ranking {
  rank: number            // 1 + weeks strictly better
  tied: boolean           // another week has the same value
  totalWeeks: number
  seasonRank: number
  seasonWeeks: number
  /** Best other week: the record to beat, or the old record when this one is #1 */
  best: WeekRow | null
}

export function rankWeek(key: StatKey, weeks: WeekRow[], current: WeekRow): Ranking {
  const v = statValue(current, key)
  const others = weeks.filter(r => r !== current && r.entries > 0)
  const season = others.filter(r => r.season === current.season)
  let best: WeekRow | null = null
  for (const r of others) if (!best || statValue(r, key) > statValue(best, key)) best = r
  return {
    rank: 1 + others.filter(r => statValue(r, key) > v).length,
    tied: others.some(r => statValue(r, key) === v),
    totalWeeks: others.length + 1,
    seasonRank: 1 + season.filter(r => statValue(r, key) > v).length,
    seasonWeeks: season.length + 1,
    best,
  }
}

export type BadgeTier = 'record' | 'podium' | 'top' | 'season'
export interface Badge { tier: BadgeTier; text: string }

/**
 * At most two badges: an all-time one (top 10 only) and "Season best".
 * Season best needs 3+ weeks played, or Week 1 would be "best" at everything.
 */
export function badgesFor(r: Ranking): Badge[] {
  const out: Badge[] = []
  if (r.rank === 1) out.push({ tier: 'record', text: r.tied ? 'Ties all-time record' : 'All-time record' })
  else if (r.rank <= 3) out.push({ tier: 'podium', text: `${r.tied ? 'T-' : ''}#${r.rank} all-time` })
  else if (r.rank <= 5) out.push({ tier: 'top', text: 'Top 5 all-time' })
  else if (r.rank <= 10) out.push({ tier: 'top', text: 'Top 10 all-time' })
  if (r.rank !== 1 && r.seasonWeeks >= 3 && r.seasonRank === 1) out.push({ tier: 'season', text: 'Season best' })
  return out
}

/** Top N weeks for a stat (the current week included), best first. */
export function topWeeks(key: StatKey, weeks: WeekRow[], n = 5): { row: WeekRow; rank: number; value: number }[] {
  const sorted = weeks.filter(r => r.entries > 0).sort((a, b) => statValue(b, key) - statValue(a, key))
  const out: { row: WeekRow; rank: number; value: number }[] = []
  for (const row of sorted) {
    const value = statValue(row, key)
    const rank = 1 + sorted.filter(r => statValue(r, key) > value).length
    if (rank > n) break
    out.push({ row, rank, value })
  }
  return out
}
