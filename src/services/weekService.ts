import { supabase } from '@/lib/supabase'

/**
 * Gets the currently active week for display purposes.
 * This stays on the current week until the next week's picks are opened.
 * 
 * @param season - The season year
 * @returns The active week number that should be displayed
 */
export async function getActiveWeek(season: number): Promise<number> {
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