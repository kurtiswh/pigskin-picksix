import { supabase } from '@/lib/supabase'
import { EntryRow, WeekRow, WeekSummaryRow, allWeeks, summarizeWeek } from '@/lib/weekRecords'

/** Read every row of a query: one request stops at 1,000 rows. */
export async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const PAGE = 1000
  let out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    out = out.concat(data || [])
    if (!data || data.length < PAGE) return out
  }
}

const ENTRY_COLUMNS = 'week, picks_made, wins, losses, pushes, total_points, lock_wins, lock_losses'

// The season's OTHER weeks don't change while you watch this one, so the Games
// page's 60s refresh reuses them.
const otherWeeksCache = new Map<string, Promise<WeekSummaryRow[]>>()

/**
 * Per-week totals for every week of the season except `week` (cached per page view).
 * Summed in the database by weekly_summaries() (migration 257): this used to download
 * every weekly_leaderboard row for those weeks (~4,700 by week 10) and add them up here,
 * one of the largest sources of Supabase egress.
 */
export function loadOtherWeeks(season: number, week: number): Promise<WeekSummaryRow[]> {
  const key = `${season}-${week}`
  if (!otherWeeksCache.has(key)) {
    const p = (async () => {
      const { data, error } = await supabase.rpc('weekly_summaries', { p_season: season, p_exclude_week: week })
      if (error) throw error
      // bigint columns can arrive as strings; normalize to numbers
      return ((data || []) as Record<string, unknown>[]).map(r => ({
        season,
        week: Number(r.week),
        entries: Number(r.entries) || 0,
        perfect: Number(r.perfect) || 0,
        zero: Number(r.zero) || 0,
        over100: Number(r.over100) || 0,
        points: Number(r.points) || 0,
        wins: Number(r.wins) || 0,
        losses: Number(r.losses) || 0,
        lockWins: Number(r.lock_wins) || 0,
        lockLosses: Number(r.lock_losses) || 0,
        scoredEntries: Number(r.scored_entries) || 0,
        scoredPoints: Number(r.scored_points) || 0,
      }))
    })()
    p.catch(() => otherWeeksCache.delete(key)) // don't cache a failure
    otherWeeksCache.set(key, p)
  }
  return otherWeeksCache.get(key)!
}

/** One week ranked against every week since 2016 (used by the recap draft). */
export async function loadWeekRecords(season: number, week: number): Promise<{ weeks: WeekRow[]; current: WeekRow }> {
  const [weekRows, otherWeeks] = await Promise.all([
    fetchAllRows<EntryRow>((from, to) => supabase
      .from('weekly_leaderboard')
      .select(ENTRY_COLUMNS)
      .eq('season', season)
      .eq('week', week)
      .order('user_id', { ascending: true })
      .range(from, to)),
    loadOtherWeeks(season, week),
  ])
  const current = summarizeWeek(season, week, weekRows)
  return { weeks: allWeeks(otherWeeks, current), current }
}
