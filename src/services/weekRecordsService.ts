import { supabase } from '@/lib/supabase'
import { EntryRow, WeekRow, allWeeks, summarizeSeason, summarizeWeek } from '@/lib/weekRecords'

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
// page's 60s refresh reuses them instead of re-reading thousands of rows.
const otherWeeksCache = new Map<string, Promise<EntryRow[]>>()

/** Every weekly_leaderboard row for the season except `week` (cached per page view). */
export function loadOtherWeeks(season: number, week: number): Promise<EntryRow[]> {
  const key = `${season}-${week}`
  if (!otherWeeksCache.has(key)) {
    const p = fetchAllRows<EntryRow>((from, to) => supabase
      .from('weekly_leaderboard')
      .select(ENTRY_COLUMNS)
      .eq('season', season)
      .neq('week', week)
      .order('week', { ascending: true })
      .order('user_id', { ascending: true })
      .range(from, to))
    p.catch(() => otherWeeksCache.delete(key)) // don't cache a failure
    otherWeeksCache.set(key, p)
  }
  return otherWeeksCache.get(key)!
}

/** One week ranked against every week since 2016 (used by the recap draft). */
export async function loadWeekRecords(season: number, week: number): Promise<{ weeks: WeekRow[]; current: WeekRow }> {
  const [weekRows, otherRows] = await Promise.all([
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
  return { weeks: allWeeks(summarizeSeason(season, otherRows), current), current }
}
