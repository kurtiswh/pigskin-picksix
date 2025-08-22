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
   * This version queries the database directly instead of using hardcoded data
   */
  private static async getVerifiedUsers(season: number): Promise<{ id: string; display_name: string }[]> {
    try {
      console.log('👥 getVerifiedUsers: Querying LeagueSafe payments for season', season)
      
      const { data: payments, error } = await supabase
        .from('leaguesafe_payments')
        .select('user_id, leaguesafe_owner_name')
        .eq('season', season)
        .eq('status', 'Paid')
        .eq('is_matched', true)
        .not('user_id', 'is', null)

      if (error) {
        console.error('LeagueSafe payments query failed:', error.message)
        console.log('Falling back to empty verified users list')
        return []
      }

      if (!payments || payments.length === 0) {
        console.log('👥 getVerifiedUsers: No verified users found for season', season)
        return []
      }

      const verifiedUsers = payments.map(payment => ({
        id: payment.user_id!,
        display_name: payment.leaguesafe_owner_name
      }))

      console.log('👥 getVerifiedUsers: Found', verifiedUsers.length, 'verified users')
      return verifiedUsers

    } catch (error) {
      console.error('getVerifiedUsers error:', error)
      return []
    }
  }

  /**
   * Get leaderboard data for a specific week
   */
  static async getWeeklyLeaderboard(season: number, week: number): Promise<LeaderboardEntry[]> {
    console.log('LeaderboardService.getWeeklyLeaderboard:', { season, week })

    try {
      // Step 1: Get verified users
      const verifiedUsers = await this.getVerifiedUsers(season)
      if (verifiedUsers.length === 0) {
        console.log('LeaderboardService.getWeeklyLeaderboard: No verified users found')
        return []
      }
      
      const verifiedUserIds = verifiedUsers.map(user => user.id)
      console.log('LeaderboardService.getWeeklyLeaderboard: Filtering for', verifiedUserIds.length, 'verified users')

      // Step 2: Get weekly leaderboard data
      const { data: weeklyData, error } = await supabase
        .from('weekly_leaderboard')
        .select('*')
        .eq('season', season)
        .eq('week', week)
        .in('user_id', verifiedUserIds)
        .order('weekly_rank', { ascending: true })

      if (error) {
        console.error('LeaderboardService.getWeeklyLeaderboard error:', error)
        return []
      }
      
      if (!weeklyData || weeklyData.length === 0) {
        console.log('LeaderboardService.getWeeklyLeaderboard: No data found for verified users in week', week)
        return []
      }
      
      console.log('LeaderboardService.getWeeklyLeaderboard: ✅ Found', weeklyData.length, 'verified weekly entries')
      
      // Format the data for the frontend
      const leaderboardEntries: LeaderboardEntry[] = weeklyData.map(entry => ({
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
      // Step 1: Get verified users
      const verifiedUsers = await this.getVerifiedUsers(season)
      if (verifiedUsers.length === 0) {
        console.log('LeaderboardService.getSeasonLeaderboard: No verified users found')
        return []
      }
      
      const verifiedUserIds = verifiedUsers.map(user => user.id)
      console.log('LeaderboardService.getSeasonLeaderboard: Filtering for', verifiedUserIds.length, 'verified users')

      // Step 2: Get season leaderboard data
      const { data: seasonData, error } = await supabase
        .from('season_leaderboard')
        .select('*')
        .eq('season', season)
        .in('user_id', verifiedUserIds)
        .order('season_rank', { ascending: true })

      if (error) {
        console.error('LeaderboardService.getSeasonLeaderboard error:', error)
        return []
      }
      
      if (!seasonData || seasonData.length === 0) {
        console.log('LeaderboardService.getSeasonLeaderboard: No data found for verified users')
        return []
      }
      
      console.log('LeaderboardService.getSeasonLeaderboard: ✅ Found', seasonData.length, 'verified season entries')
      
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
      console.error('LeaderboardService.getSeasonLeaderboard failed:', error)
      return []
    }
  }
}