import { supabase } from '@/lib/supabase'

// "Which week is it" lookups run on nearly every page and change only when an admin
// opens a week or a game goes final. Share one answer per season for a short window
// (and one in-flight request) instead of asking the database on every navigation.
const WEEK_CACHE_TTL_MS = 2 * 60 * 1000
const weekCache = new Map<string, { at: number; value: Promise<number> }>()

function cachedWeek(key: string, load: () => Promise<number>): Promise<number> {
  const hit = weekCache.get(key)
  if (hit && Date.now() - hit.at < WEEK_CACHE_TTL_MS) return hit.value
  const value = load()
  weekCache.set(key, { at: Date.now(), value })
  return value
}

/** Drop cached week lookups (call after an admin changes week_settings). */
export function clearWeekCache(): void {
  weekCache.clear()
}

/**
 * Highest week configured for a season (has games selected). Used to bound the
 * week-picker dropdowns so they only list weeks that actually exist, instead of
 * a hardcoded range or the latest-week-with-results (which can lag behind).
 *
 * @param season - The season year
 * @returns The max configured week, or 0 if none found
 */
export function getMaxConfiguredWeek(season: number): Promise<number> {
  return cachedWeek(`getMaxConfiguredWeek:${season}`, () => getMaxConfiguredWeekUncached(season))
}

async function getMaxConfiguredWeekUncached(season: number): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('week_settings')
      .select('week')
      .eq('season', season)
      .eq('games_selected', true)
      .order('week', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) return 0
    return data.week
  } catch (err) {
    console.error('getMaxConfiguredWeek error:', err)
    return 0
  }
}

/**
 * Gets the currently active week for display purposes.
 * This stays on the current week until the next week's picks are opened.
 * 
 * @param season - The season year
 * @returns The active week number that should be displayed
 */
export function getActiveWeek(season: number): Promise<number> {
  return cachedWeek(`getActiveWeek:${season}`, () => getActiveWeekUncached(season))
}

async function getActiveWeekUncached(season: number): Promise<number> {
  try {
    // First, try to get the most recent week with picks_open = true
    const { data: openWeek, error: openWeekError } = await supabase
      .from('week_settings')
      .select('week')
      .eq('season', season)
      .eq('picks_open', true)
      .order('week', { ascending: false })
      .limit(1)
      .single()
    
    if (!openWeekError && openWeek) {
      // If we found a week with picks open, use that week
      return openWeek.week
    }
    
    // If no week has picks open, get the most recent week with games_selected = true
    const { data: latestWeek, error: latestWeekError } = await supabase
      .from('week_settings')
      .select('week')
      .eq('season', season)
      .eq('games_selected', true)
      .order('week', { ascending: false })
      .limit(1)
      .single()
    
    if (!latestWeekError && latestWeek) {
      // Return the most recent week with games selected
      return latestWeek.week
    }
    
    // If no weeks have games selected, return week 1
    return 1
  } catch (error) {
    console.error('Error getting active week:', error)
    // Fall back to week 1 on error
    return 1
  }
}

/**
 * Gets the current week settings for the active week
 */
export async function getActiveWeekSettings(season: number) {
  const activeWeek = await getActiveWeek(season)
  
  const { data, error } = await supabase
    .from('week_settings')
    .select('*')
    .eq('season', season)
    .eq('week', activeWeek)
    .single()
  
  if (error) {
    console.error('Error fetching active week settings:', error)
    return null
  }
  
  return data
}

/**
 * Gets the latest week that has completed games with results
 * Perfect for defaulting leaderboard views to the most recent week with data
 * 
 * @param season - The season year
 * @returns The latest week number with completed games, or 1 if none found
 */
export function getLatestWeekWithResults(season: number): Promise<number> {
  return cachedWeek(`getLatestWeekWithResults:${season}`, () => getLatestWeekWithResultsUncached(season))
}

async function getLatestWeekWithResultsUncached(season: number): Promise<number> {
  try {
    console.log('🔍 Finding latest week with results for season', season)
    
    // Query games to find the highest week with completed games
    const { data: completedGames, error } = await supabase
      .from('games')
      .select('week')
      .eq('season', season)
      .eq('status', 'completed')
      .order('week', { ascending: false })
      .limit(1)
    
    if (error) {
      console.error('❌ Error finding latest week with results:', error)
      return 1
    }
    
    if (completedGames && completedGames.length > 0) {
      const latestWeek = completedGames[0].week
      console.log('✅ Found latest week with completed games:', latestWeek)
      return latestWeek
    }
    
    // If no completed games, check for the highest week with any games
    const { data: anyGames, error: anyError } = await supabase
      .from('games')
      .select('week')
      .eq('season', season)
      .order('week', { ascending: false })
      .limit(1)
    
    if (!anyError && anyGames && anyGames.length > 0) {
      const latestWeek = anyGames[0].week
      console.log('📊 Found latest week with games (not yet completed):', latestWeek)
      return latestWeek
    }
    
    console.log('⚠️ No games found for season, defaulting to week 1')
    return 1
    
  } catch (error) {
    console.error('❌ Error in getLatestWeekWithResults:', error)
    return 1
  }
}