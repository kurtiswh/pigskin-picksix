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
  rank_change?: number // Positive means moved up, negative means moved down
  previous_rank?: number // Rank from previous week
  live_calculated?: boolean
  pick_source?: 'authenticated' | 'anonymous' | 'mixed'
}

export class LeaderboardService {
  /**
   * Create a timeout promise for database queries
   */
  private static createTimeoutPromise<T>(timeoutMs: number): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Query timeout after ${timeoutMs/1000} seconds`))
      }, timeoutMs)
    })
  }

  /**
   * Get leaderboard data for the entire season
   * Uses season_leaderboard view that automatically respects pick set precedence
   * (authenticated picks take precedence over anonymous picks via is_active_pick_set)
   */
  static async getSeasonLeaderboard(season: number): Promise<LeaderboardEntry[]> {
    console.log('🏆 LeaderboardService.getSeasonLeaderboard: Starting for season', season)

    try {
      // Set up query with timeout protection
      const timeoutPromise = this.createTimeoutPromise<any>(10000) // 10 second timeout
      
      const queryPromise = supabase
        .from('season_leaderboard')
        .select('user_id, display_name, total_points, season_rank, total_wins, total_losses, total_pushes, lock_wins, lock_losses, total_picks, is_verified, pick_source')
        .eq('season', season)
        // Trust the view to handle pick set precedence - no additional filtering needed
        // The view already respects is_active_pick_set from our trigger system
        .order('season_rank', { ascending: true })

      const { data: seasonData, error } = await Promise.race([queryPromise, timeoutPromise])

      if (error) {
        console.error('🏆 LeaderboardService.getSeasonLeaderboard error:', error)
        throw new Error(`Database error: ${error.message}`)
      }
      
      if (!seasonData || seasonData.length === 0) {
        console.log('🏆 LeaderboardService.getSeasonLeaderboard: No season leaderboard data found for season', season)
        console.log('💡 This may indicate the leaderboard triggers haven\'t populated the views yet')
        return []
      }
      
      console.log('🏆 LeaderboardService.getSeasonLeaderboard: ✅ Found', seasonData.length, 'season entries')
      console.log('📊 Pick source distribution:', this.analyzePickSources(seasonData))
      return this.formatSeasonData(seasonData)

    } catch (error) {
      console.error('🏆 LeaderboardService.getSeasonLeaderboard failed:', error)
      throw error // Re-throw to allow proper error handling upstream
    }
  }

  /**
   * Format season data for frontend consumption
   */
  private static formatSeasonData(data: any[]): LeaderboardEntry[] {
    const leaderboardEntries: LeaderboardEntry[] = data.map(entry => ({
      user_id: entry.user_id,
      display_name: entry.display_name,
      weekly_record: '', // Not available in season view
      season_record: `${entry.total_wins || 0}-${entry.total_losses || 0}-${entry.total_pushes || 0}`,
      lock_record: `${entry.lock_wins || 0}-${entry.lock_losses || 0}`,
      weekly_points: 0, // Not available in season view
      season_points: entry.total_points || 0,
      weekly_rank: 0, // Not available in season view
      season_rank: entry.season_rank || 0,
      total_picks: entry.total_picks || 0,
      total_wins: entry.total_wins || 0,
      total_losses: entry.total_losses || 0,
      total_pushes: entry.total_pushes || 0,
      lock_wins: entry.lock_wins || 0,
      lock_losses: entry.lock_losses || 0,
      pick_source: entry.pick_source || 'authenticated'
    }))
    
    console.log('✅ Generated season leaderboard:', leaderboardEntries.length, 'entries')
    return leaderboardEntries
  }

  /**
   * Get leaderboard data for a specific week
   * Uses weekly_leaderboard view that automatically respects pick set precedence
   * (authenticated picks take precedence over anonymous picks via is_active_pick_set)
   */
  static async getWeeklyLeaderboard(season: number, week: number): Promise<LeaderboardEntry[]> {
    console.log('📊 LeaderboardService.getWeeklyLeaderboard:', { season, week })

    try {
      // Set up query with timeout protection
      const timeoutPromise = this.createTimeoutPromise<any>(10000) // 10 second timeout
      
      const queryPromise = supabase
        .from('weekly_leaderboard')
        .select('user_id, display_name, total_points, weekly_rank, wins, losses, pushes, lock_wins, lock_losses, picks_made, is_verified, pick_source')
        .eq('season', season)
        .eq('week', week)
        // Trust the view to handle pick set precedence - no additional filtering needed
        // The view already respects is_active_pick_set from our trigger system
        .order('weekly_rank', { ascending: true })

      const { data: weeklyData, error } = await Promise.race([queryPromise, timeoutPromise])

      if (error) {
        console.error('📊 LeaderboardService.getWeeklyLeaderboard error:', error)
        throw new Error(`Database error: ${error.message}`)
      }

      if (!weeklyData || weeklyData.length === 0) {
        console.log('📊 LeaderboardService.getWeeklyLeaderboard: No weekly leaderboard data found for season', season, 'week', week)
        console.log('💡 This may indicate the leaderboard triggers haven\'t populated the weekly view yet')
        return []
      }

      console.log('📊 LeaderboardService.getWeeklyLeaderboard: ✅ Found', weeklyData.length, 'weekly entries')
      console.log('📊 Pick source distribution:', this.analyzePickSources(weeklyData))
      return this.formatWeeklyData(weeklyData)

    } catch (error) {
      console.error('📊 LeaderboardService.getWeeklyLeaderboard failed:', error)
      throw error // Re-throw to allow proper error handling upstream
    }
  }

  /**
   * Format weekly data for frontend consumption
   */
  private static formatWeeklyData(data: any[]): LeaderboardEntry[] {
    const leaderboardEntries: LeaderboardEntry[] = data.map(entry => ({
      user_id: entry.user_id,
      display_name: entry.display_name,
      weekly_record: `${entry.wins || 0}-${entry.losses || 0}-${entry.pushes || 0}`,
      season_record: '', // Not available in weekly view
      lock_record: `${entry.lock_wins || 0}-${entry.lock_losses || 0}`,
      weekly_points: entry.total_points || 0,
      season_points: 0, // Not available in weekly view
      weekly_rank: entry.weekly_rank || 0,
      season_rank: 0, // Not available in weekly view
      total_picks: entry.picks_made || 0,
      total_wins: entry.wins || 0,
      total_losses: entry.losses || 0,
      total_pushes: entry.pushes || 0,
      lock_wins: entry.lock_wins || 0,
      lock_losses: entry.lock_losses || 0,
      pick_source: entry.pick_source || 'authenticated'
    }))

    console.log('✅ Generated weekly leaderboard:', leaderboardEntries.length, 'entries')
    return leaderboardEntries
  }

  /**
   * Analyze pick source distribution for debugging and monitoring
   */
  private static analyzePickSources(data: any[]): {[key: string]: number} {
    const distribution = data.reduce((acc: {[key: string]: number}, entry) => {
      const source = entry.pick_source || 'unknown'
      acc[source] = (acc[source] || 0) + 1
      return acc
    }, {})
    
    return distribution
  }

  /**
   * Get season leaderboard with rank changes from previous week
   * This calculates how each user's rank has changed since last week
   */
  static async getSeasonLeaderboardWithRankChanges(season: number, currentWeek: number): Promise<LeaderboardEntry[]> {
    console.log('📈 Getting season leaderboard with rank changes for week', currentWeek)
    
    try {
      // Get current season leaderboard
      const currentLeaderboard = await this.getSeasonLeaderboard(season)
      
      // If it's week 1, no previous rankings exist
      if (currentWeek <= 1) {
        return currentLeaderboard
      }
      
      // Calculate what the season rankings were through the previous week
      const previousWeekRankings = await this.getSeasonRankingsAsOfWeek(season, currentWeek - 1)
      
      // Create a map of previous rankings by user_id
      const previousRankMap = new Map<string, number>()
      previousWeekRankings.forEach((entry, index) => {
        previousRankMap.set(entry.user_id, index + 1) // Rankings are 1-based
      })
      
      // Calculate rank changes for each user
      const leaderboardWithChanges = currentLeaderboard.map(entry => {
        const previousRank = previousRankMap.get(entry.user_id)
        
        if (previousRank === undefined) {
          // New player this week
          return {
            ...entry,
            rank_change: undefined,
            previous_rank: undefined,
            trend: 'same' as const
          }
        }
        
        const rankChange = previousRank - entry.season_rank // Positive = moved up
        let trend: 'up' | 'down' | 'same' = 'same'
        
        if (rankChange > 0) trend = 'up'
        else if (rankChange < 0) trend = 'down'
        
        return {
          ...entry,
          rank_change: rankChange,
          previous_rank: previousRank,
          trend
        }
      })
      
      console.log('✅ Calculated rank changes for', leaderboardWithChanges.length, 'users')
      return leaderboardWithChanges
      
    } catch (error) {
      console.error('❌ Error calculating rank changes:', error)
      // Return current leaderboard without rank changes on error
      return this.getSeasonLeaderboard(season)
    }
  }

  /**
   * Get season rankings as they were at the end of a specific week
   * This recalculates season totals using only games through that week
   */
  private static async getSeasonRankingsAsOfWeek(season: number, throughWeek: number): Promise<any[]> {
    console.log('📊 Calculating season rankings through week', throughWeek)
    
    try {
      // Query to get cumulative points through specified week
      const { data, error } = await supabase
        .from('picks')
        .select(`
          user_id,
          users!inner(display_name),
          points_earned
        `)
        .eq('season', season)
        .lte('week', throughWeek)
        .eq('submitted', true)
        .eq('show_on_leaderboard', true)
      
      if (error) {
        console.error('Error fetching historical rankings:', error)
        return []
      }
      
      // Aggregate points by user
      const userPoints = new Map<string, { user_id: string, display_name: string, total_points: number }>()
      
      data?.forEach(pick => {
        const userId = pick.user_id
        const existing = userPoints.get(userId) || {
          user_id: userId,
          display_name: pick.users?.display_name || 'Unknown',
          total_points: 0
        }
        existing.total_points += pick.points_earned || 0
        userPoints.set(userId, existing)
      })
      
      // Convert to array and sort by points
      const rankings = Array.from(userPoints.values())
        .sort((a, b) => b.total_points - a.total_points)
      
      console.log('✅ Calculated rankings for', rankings.length, 'users through week', throughWeek)
      return rankings
      
    } catch (error) {
      console.error('Error calculating historical rankings:', error)
      return []
    }
  }

}