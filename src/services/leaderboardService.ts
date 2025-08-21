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
   * Get verified LeagueSafe players for the specified season
   */
  private static async getVerifiedUsers(season: number): Promise<{ id: string; display_name: string }[]> {
    console.log('👥 getVerifiedUsers: Getting LeagueSafe verified players for season', season)
    
    try {
      const { data: payments, error } = await supabase
        .from('leaguesafe_payments')
        .select('user_id, leaguesafe_owner_name')
        .eq('season', season)
        .eq('status', 'Paid')
        .eq('is_matched', true)
        .not('user_id', 'is', null)
      
      if (error) {
        console.error('👥 getVerifiedUsers: Query failed:', error)
        throw error
      }
      
      const verifiedUsers = (payments || []).map(payment => ({
        id: payment.user_id,
        display_name: payment.leaguesafe_owner_name
      }))
      
      console.log('👥 getVerifiedUsers: Found', verifiedUsers.length, 'verified LeagueSafe players')
      return verifiedUsers
      
    } catch (error) {
      console.error('👥 getVerifiedUsers: Exception:', error)
      return []
    }
  }

  /**
   * Get leaderboard data for a specific week
   */
  static async getWeeklyLeaderboard(season: number, week: number): Promise<LeaderboardEntry[]> {
    console.log('LeaderboardService.getWeeklyLeaderboard:', { season, week })

    try {
      console.log('LeaderboardService.getWeeklyLeaderboard: 1/2 - Getting verified LeagueSafe users...')
      const verifiedUsers = await this.getVerifiedUsers(season)
      console.log('LeaderboardService.getWeeklyLeaderboard: ✅ Found', verifiedUsers.length, 'verified users')
      
      if (verifiedUsers.length === 0) {
        console.log('LeaderboardService.getWeeklyLeaderboard: No verified users found, returning empty leaderboard')
        return []
      }
      
      const verifiedUserIds = verifiedUsers.map(user => user.id)
      
      console.log('LeaderboardService.getWeeklyLeaderboard: 2/2 - Getting weekly leaderboard data from database view...')
      const { data: weeklyData, error } = await supabase
        .from('weekly_leaderboard')
        .select('*')
        .eq('season', season)
        .eq('week', week)
        .in('user_id', verifiedUserIds)
      
      if (error) {
        console.error('LeaderboardService.getWeeklyLeaderboard: Query failed:', error)
        throw error
      }
      
      console.log('LeaderboardService.getWeeklyLeaderboard: ✅ Found', weeklyData?.length || 0, 'weekly leaderboard entries')
      
      // Format the data for the frontend
      const leaderboardEntries = (weeklyData || []).map(entry => ({
        user_id: entry.user_id,
        display_name: entry.display_name,
        weekly_record: `${entry.wins}-${entry.losses}-${entry.pushes}`,
        season_record: '', // Not available in weekly view
        lock_record: `${entry.lock_wins}-${entry.lock_losses}`,
        weekly_points: entry.total_points,
        season_points: 0, // Not available in weekly view
        weekly_rank: entry.weekly_rank,
        season_rank: 0, // Not available in weekly view
        total_picks: entry.picks_made,
        total_wins: entry.wins,
        total_losses: entry.losses,
        total_pushes: entry.pushes,
        lock_wins: entry.lock_wins,
        lock_losses: entry.lock_losses
      }))
      
      console.log('✅ Generated weekly leaderboard:', leaderboardEntries.length, 'entries')
      return leaderboardEntries

    } catch (error) {
      console.error('LeaderboardService.getWeeklyLeaderboard failed:', error)
      return []
    }
  }

  /**
   * Get leaderboard data for the entire season
   */
  static async getSeasonLeaderboard(season: number): Promise<LeaderboardEntry[]> {
    console.log('LeaderboardService.getSeasonLeaderboard:', { season })

    try {
      console.log('LeaderboardService.getSeasonLeaderboard: 1/2 - Getting verified LeagueSafe users...')
      const verifiedUsers = await this.getVerifiedUsers(season)
      console.log('LeaderboardService.getSeasonLeaderboard: ✅ Found', verifiedUsers.length, 'verified users')
      
      if (verifiedUsers.length === 0) {
        console.log('LeaderboardService.getSeasonLeaderboard: No verified users found, returning empty leaderboard')
        return []
      }
      
      const verifiedUserIds = verifiedUsers.map(user => user.id)
      
      console.log('LeaderboardService.getSeasonLeaderboard: 2/2 - Getting season leaderboard data from database view...')
      const { data: seasonData, error } = await supabase
        .from('season_leaderboard')
        .select('*')
        .eq('season', season)
        .in('user_id', verifiedUserIds)
      
      if (error) {
        console.error('LeaderboardService.getSeasonLeaderboard: Query failed:', error)
        throw error
      }
      
      console.log('LeaderboardService.getSeasonLeaderboard: ✅ Found', seasonData?.length || 0, 'season leaderboard entries')
      
      // Format the data for the frontend
      const leaderboardEntries = (seasonData || []).map(entry => ({
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
      console.error('LeaderboardService.getSeasonLeaderboard failed:', error)
      return []
    }
  }
}