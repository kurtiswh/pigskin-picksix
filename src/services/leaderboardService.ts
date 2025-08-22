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
   * Get leaderboard data for the entire season
   */
  static async getSeasonLeaderboard(season: number): Promise<LeaderboardEntry[]> {
    console.log('🏆 LeaderboardService.getSeasonLeaderboard: Starting for season', season)

    try {
      // Query the season_leaderboard table directly with proper is_verified filtering
      const { data: seasonData, error } = await supabase
        .from('season_leaderboard')
        .select('user_id, display_name, total_points, season_rank, total_wins, total_losses, total_pushes, lock_wins, lock_losses, total_picks, is_verified')
        .eq('season', season)
        .eq('is_verified', true) // Only show verified/paid users
        .order('season_rank', { ascending: true })

      if (error) {
        console.error('🏆 LeaderboardService.getSeasonLeaderboard error:', error)
        return []
      }
      
      if (!seasonData || seasonData.length === 0) {
        console.log('🏆 LeaderboardService.getSeasonLeaderboard: No verified users found for season', season)
        return []
      }
      
      console.log('🏆 LeaderboardService.getSeasonLeaderboard: ✅ Found', seasonData.length, 'verified season entries')
      
      // Format the data for the frontend
      const leaderboardEntries: LeaderboardEntry[] = seasonData.map(entry => ({
        user_id: entry.user_id,
        display_name: entry.display_name,
        weekly_record: '', // Not available in season view
        season_record: `${entry.total_wins}-${entry.total_losses}-${entry.total_pushes}`,
        lock_record: `${entry.lock_wins}-${entry.lock_losses}`,
        weekly_points: 0, // Not available in season view
        season_points: entry.total_points,
        weekly_rank: 0, // Not available in season view
        season_rank: entry.season_rank,
        total_picks: entry.total_picks,
        total_wins: entry.total_wins,
        total_losses: entry.total_losses,
        total_pushes: entry.total_pushes,
        lock_wins: entry.lock_wins,
        lock_losses: entry.lock_losses
      }))
      
      console.log('✅ Generated season leaderboard:', leaderboardEntries.length, 'entries')
      return leaderboardEntries

    } catch (error) {
      console.error('🏆 LeaderboardService.getSeasonLeaderboard failed:', error)
      return []
    }
  }

  /**
   * Get leaderboard data for a specific week
   */
  static async getWeeklyLeaderboard(season: number, week: number): Promise<LeaderboardEntry[]> {
    console.log('📊 LeaderboardService.getWeeklyLeaderboard:', { season, week })

    try {
      // Query the weekly_leaderboard table directly with proper is_verified filtering
      const { data: weeklyData, error } = await supabase
        .from('weekly_leaderboard')
        .select('user_id, display_name, total_points, weekly_rank, wins, losses, pushes, lock_wins, lock_losses, picks_made, is_verified')
        .eq('season', season)
        .eq('week', week)
        .eq('is_verified', true) // Only show verified/paid users
        .order('weekly_rank', { ascending: true })

      if (error) {
        console.error('📊 LeaderboardService.getWeeklyLeaderboard error:', error)
        return []
      }

      if (!weeklyData || weeklyData.length === 0) {
        console.log('📊 LeaderboardService.getWeeklyLeaderboard: No verified weekly data found for season', season, 'week', week)
        return []
      }

      console.log('📊 LeaderboardService.getWeeklyLeaderboard: ✅ Found', weeklyData.length, 'verified weekly entries')

      // Format the data for the frontend
      const leaderboardEntries: LeaderboardEntry[] = weeklyData.map(entry => ({
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
        lock_losses: entry.lock_losses || 0
      }))

      console.log('✅ Generated weekly leaderboard:', leaderboardEntries.length, 'entries')
      return leaderboardEntries

    } catch (error) {
      console.error('📊 LeaderboardService.getWeeklyLeaderboard failed:', error)
      return []
    }
  }

}