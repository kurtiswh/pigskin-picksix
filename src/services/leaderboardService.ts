import { supabase } from '@/lib/supabase'

export interface LeaderboardEntry {
  user_id: string
  display_name: string
  weekly_record?: string
  season_record: string
  lock_record: string
  weekly_points?: number
  season_points: number
  weekly_rank?: number
  season_rank: number
  best_finish_rank?: number
  total_picks: number
  total_wins: number
  total_losses: number
  total_pushes: number
  lock_wins: number
  lock_losses: number
  last_week_points?: number
  trend?: 'up' | 'down' | 'same'
  live_calculated?: boolean
}

export class LeaderboardService {
  /**
   * EMERGENCY MODE: Using simplified production-safe queries
   * This replaces the complex trigger-based system temporarily to fix hanging issues
   */
  /**
   * Emergency production fallback - use simple queries with timeouts
   */
  static async getSeasonLeaderboard(season: number): Promise<LeaderboardEntry[]> {
    console.log('🚨 EMERGENCY: Using simplified season leaderboard for', season)

    try {
      // Set a 5-second timeout for better UX
      const timeoutPromise = new Promise<LeaderboardEntry[]>((_, reject) => {
        setTimeout(() => reject(new Error('Emergency timeout: 5 seconds')), 5000)
      })

      const queryPromise = this.getSimpleSeasonData(season)
      
      return await Promise.race([queryPromise, timeoutPromise])
    } catch (error) {
      console.error('🚨 EMERGENCY: Season leaderboard failed:', error.message)
      // Return mock data to prevent total failure
      return this.getMockSeasonData()
    }
  }

  static async getWeeklyLeaderboard(season: number, week: number): Promise<LeaderboardEntry[]> {
    console.log('🚨 EMERGENCY: Using simplified weekly leaderboard for', season, week)

    try {
      // Set a 5-second timeout for better UX
      const timeoutPromise = new Promise<LeaderboardEntry[]>((_, reject) => {
        setTimeout(() => reject(new Error('Emergency timeout: 5 seconds')), 5000)
      })

      const queryPromise = this.getSimpleWeeklyData(season, week)
      
      return await Promise.race([queryPromise, timeoutPromise])
    } catch (error) {
      console.error('🚨 EMERGENCY: Weekly leaderboard failed:', error.message)
      // Return mock data to prevent total failure
      return this.getMockWeeklyData(week)
    }
  }

  private static async getSimpleSeasonData(season: number): Promise<LeaderboardEntry[]> {
    console.log('📊 Attempting ultra-simple season query...')
    
    // Try the absolute simplest query possible - remove is_verified filter
    // This avoids potential RLS issues with the is_verified column
    const { data: seasonData, error } = await supabase
      .from('season_leaderboard')
      .select('user_id, display_name, total_points, season_rank, total_wins, total_losses, total_pushes, lock_wins, lock_losses, total_picks')
      .eq('season', season)
      .order('season_rank', { ascending: true })
      .limit(15) // Even smaller limit

    if (error) {
      console.error('📊 Ultra-simple season query failed:', error.message)
      throw error
    }

    if (!seasonData || seasonData.length === 0) {
      console.log('📊 No season data found')
      return []
    }

    console.log('📊 Ultra-simple season query success:', seasonData.length, 'entries')

    return seasonData.map(entry => ({
      user_id: entry.user_id,
      display_name: entry.display_name,
      weekly_record: '',
      season_record: `${entry.total_wins || 0}-${entry.total_losses || 0}-${entry.total_pushes || 0}`,
      lock_record: `${entry.lock_wins || 0}-${entry.lock_losses || 0}`,
      weekly_points: 0,
      season_points: entry.total_points || 0,
      weekly_rank: 0,
      season_rank: entry.season_rank || 0,
      total_picks: entry.total_picks || 0,
      total_wins: entry.total_wins || 0,
      total_losses: entry.total_losses || 0,
      total_pushes: entry.total_pushes || 0,
      lock_wins: entry.lock_wins || 0,
      lock_losses: entry.lock_losses || 0
    }))
  }

  private static async getSimpleWeeklyData(season: number, week: number): Promise<LeaderboardEntry[]> {
    console.log('📊 Attempting simple weekly query for week', week)
    
    // Try weekly leaderboard table first
    const { data: weeklyData, error } = await supabase
      .from('weekly_leaderboard')
      .select('user_id, display_name, total_points, weekly_rank, wins, losses, pushes, lock_wins, lock_losses, picks_made, is_verified')
      .eq('season', season)
      .eq('week', week)
      .eq('is_verified', true)
      .order('weekly_rank', { ascending: true })
      .limit(20)

    if (error) {
      console.error('📊 Simple weekly query failed:', error.message)
      // Fall back to empty result rather than complex query
      return []
    }

    if (!weeklyData || weeklyData.length === 0) {
      console.log('📊 No weekly data found - table may be empty')
      return []
    }

    console.log('📊 Simple weekly query success:', weeklyData.length, 'entries')

    return weeklyData.map(entry => ({
      user_id: entry.user_id,
      display_name: entry.display_name,
      weekly_record: `${entry.wins || 0}-${entry.losses || 0}-${entry.pushes || 0}`,
      season_record: '',
      lock_record: `${entry.lock_wins || 0}-${entry.lock_losses || 0}`,
      weekly_points: entry.total_points || 0,
      season_points: 0,
      weekly_rank: entry.weekly_rank || 0,
      season_rank: 0,
      total_picks: entry.picks_made || 0,
      total_wins: entry.wins || 0,
      total_losses: entry.losses || 0,
      total_pushes: entry.pushes || 0,
      lock_wins: entry.lock_wins || 0,
      lock_losses: entry.lock_losses || 0
    }))
  }

  private static getMockSeasonData(): LeaderboardEntry[] {
    console.log('🚨 EMERGENCY: Returning mock season data')
    return [
      {
        user_id: 'loading-1',
        display_name: 'Loading data...',
        weekly_record: '',
        season_record: '⏳ Loading...',
        lock_record: '⏳',
        weekly_points: 0,
        season_points: 0,
        weekly_rank: 0,
        season_rank: 1,
        total_picks: 0,
        total_wins: 0,
        total_losses: 0,
        total_pushes: 0,
        lock_wins: 0,
        lock_losses: 0
      },
      {
        user_id: 'loading-2',
        display_name: 'Please wait...',
        weekly_record: '',
        season_record: '⏳ Loading...',
        lock_record: '⏳',
        weekly_points: 0,
        season_points: 0,
        weekly_rank: 0,
        season_rank: 2,
        total_picks: 0,
        total_wins: 0,
        total_losses: 0,
        total_pushes: 0,
        lock_wins: 0,
        lock_losses: 0
      }
    ]
  }

  private static getMockWeeklyData(week: number): LeaderboardEntry[] {
    console.log('🚨 EMERGENCY: Returning mock weekly data for week', week)
    return [
      {
        user_id: 'loading-weekly',
        display_name: `Loading Week ${week}...`,
        weekly_record: '⏳ Loading...',
        season_record: '',
        lock_record: '⏳',
        weekly_points: 0,
        season_points: 0,
        weekly_rank: 1,
        season_rank: 0,
        total_picks: 0,
        total_wins: 0,
        total_losses: 0,
        total_pushes: 0,
        lock_wins: 0,
        lock_losses: 0
      }
    ]
  }
}