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
   * Detect if the new trigger-based system is deployed
   */
  private static async isNewSystemDeployed(): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('season_leaderboard')
        .select('payment_status, is_verified')
        .limit(1)

      return !error && data && data.length > 0 && data[0].hasOwnProperty('payment_status')
    } catch {
      return false
    }
  }

  /**
   * Get verified LeagueSafe players for the specified season (fallback method)
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
   * Build weekly leaderboard data directly from picks table
   * Used when weekly_leaderboard materialized table is empty
   */
  private static async buildWeeklyLeaderboardFromPicks(season: number, week: number): Promise<LeaderboardEntry[]> {
    try {
      console.log('🔨 Building weekly leaderboard from picks for season', season, 'week', week)

      // Step 1: Get verified users first (for filtering)
      const verifiedUsers = await this.getVerifiedUsers(season)
      if (verifiedUsers.length === 0) {
        console.log('No verified users found for season', season)
        return []
      }
      
      const verifiedUserIds = verifiedUsers.map(user => user.id)
      console.log('Found', verifiedUserIds.length, 'verified users')

      // Step 2: Get all picks for this week from verified users
      const { data: picks, error: picksError } = await supabase
        .from('picks')
        .select('user_id, result, points_earned, is_lock')
        .eq('season', season)
        .eq('week', week)
        .in('user_id', verifiedUserIds)

      if (picksError) {
        console.error('Error fetching picks:', picksError)
        return []
      }

      if (!picks || picks.length === 0) {
        console.log('No picks found for verified users in week', week)
        return []
      }

      console.log('Found', picks.length, 'picks for week', week)

      // Step 3: Get user display names
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, display_name')
        .in('id', verifiedUserIds)

      if (usersError) {
        console.error('Error fetching users:', usersError)
        return []
      }

      const userMap = users?.reduce((acc, user) => {
        acc[user.id] = user.display_name
        return acc
      }, {} as Record<string, string>) || {}

      // Step 4: Calculate weekly stats for each user
      const userStats = picks.reduce((acc, pick) => {
        if (!acc[pick.user_id]) {
          acc[pick.user_id] = {
            user_id: pick.user_id,
            picks_made: 0,
            wins: 0,
            losses: 0,
            pushes: 0,
            lock_wins: 0,
            lock_losses: 0,
            total_points: 0
          }
        }

        const stats = acc[pick.user_id]
        stats.picks_made++
        stats.total_points += pick.points_earned || 0

        if (pick.result === 'win') {
          stats.wins++
          if (pick.is_lock) stats.lock_wins++
        } else if (pick.result === 'loss') {
          stats.losses++
          if (pick.is_lock) stats.lock_losses++
        } else if (pick.result === 'push') {
          stats.pushes++
        }

        return acc
      }, {} as Record<string, any>)

      // Step 5: Convert to array and add rankings
      const weeklyEntries = Object.values(userStats)
        .map((stats: any) => ({
          user_id: stats.user_id,
          display_name: userMap[stats.user_id] || 'Unknown User',
          picks_made: stats.picks_made,
          wins: stats.wins,
          losses: stats.losses,
          pushes: stats.pushes,
          lock_wins: stats.lock_wins,
          lock_losses: stats.lock_losses,
          total_points: stats.total_points
        }))
        .sort((a, b) => b.total_points - a.total_points) // Sort by points descending
        .map((entry, index) => ({
          ...entry,
          weekly_rank: index + 1
        }))

      // Step 6: Format for frontend
      const leaderboardEntries: LeaderboardEntry[] = weeklyEntries.map(entry => ({
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
        lock_losses: entry.lock_losses,
        live_calculated: true // Indicate this was calculated on-demand
      }))

      console.log('✅ Built weekly leaderboard from picks:', leaderboardEntries.length, 'entries')
      return leaderboardEntries

    } catch (error) {
      console.error('Error building weekly leaderboard from picks:', error)
      return []
    }
  }

  /**
   * Get leaderboard data for a specific week
   */
  static async getWeeklyLeaderboard(season: number, week: number): Promise<LeaderboardEntry[]> {
    console.log('LeaderboardService.getWeeklyLeaderboard:', { season, week })

    try {
      const isNewSystem = await this.isNewSystemDeployed()
      console.log('LeaderboardService: Using', isNewSystem ? 'NEW trigger-based' : 'FALLBACK', 'system')

      if (isNewSystem) {
        // NEW SYSTEM: Try materialized weekly_leaderboard table first
        const { data: weeklyData, error } = await supabase
          .from('weekly_leaderboard')
          .select('*')
          .eq('season', season)
          .eq('week', week)
          .eq('is_verified', true) // Only show verified/paid users
          .order('weekly_rank', { ascending: true })

        if (error) {
          console.error('LeaderboardService.getWeeklyLeaderboard error:', error)
          // Fall back to building from picks table
          console.log('Falling back to picks table approach...')
        } else if (weeklyData && weeklyData.length > 0) {
          console.log('LeaderboardService.getWeeklyLeaderboard: ✅ Found', weeklyData.length, 'verified weekly entries from materialized table')
          
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
          
          console.log('✅ Generated weekly leaderboard from materialized table:', leaderboardEntries.length, 'entries')
          return leaderboardEntries
        } else {
          console.log('LeaderboardService.getWeeklyLeaderboard: Materialized table empty, building from picks...')
        }

        // FALLBACK: Build weekly data from picks table directly
        return await this.buildWeeklyLeaderboardFromPicks(season, week)

      } else {
        // FALLBACK SYSTEM: Build from picks table directly
        console.log('LeaderboardService.getWeeklyLeaderboard: Using fallback system - building from picks')
        return await this.buildWeeklyLeaderboardFromPicks(season, week)
      }

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
      const isNewSystem = await this.isNewSystemDeployed()
      console.log('LeaderboardService: Using', isNewSystem ? 'NEW trigger-based' : 'FALLBACK', 'system')

      if (isNewSystem) {
        // NEW SYSTEM: Query the materialized season_leaderboard table directly
        const { data: seasonData, error } = await supabase
          .from('season_leaderboard')
          .select('*')
          .eq('season', season)
          .eq('is_verified', true) // Only show verified/paid users
          .order('season_rank', { ascending: true })

        if (error) {
          console.error('LeaderboardService.getSeasonLeaderboard error:', error)
          return []
        }
        
        if (!seasonData || seasonData.length === 0) {
          console.log('LeaderboardService.getSeasonLeaderboard: No verified users found for season', season)
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

      } else {
        // FALLBACK SYSTEM: Use existing views with verified user filtering
        const verifiedUsers = await this.getVerifiedUsers(season)
        if (verifiedUsers.length === 0) {
          console.log('LeaderboardService.getSeasonLeaderboard: No verified users found')
          return []
        }
        
        const verifiedUserIds = verifiedUsers.map(user => user.id)
        console.log('LeaderboardService.getSeasonLeaderboard: Filtering for', verifiedUserIds.length, 'verified users')

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
      }

    } catch (error) {
      console.error('LeaderboardService.getSeasonLeaderboard failed:', error)
      return []
    }
  }
}