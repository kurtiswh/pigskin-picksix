import { supabase } from '@/lib/supabase'

export interface EmergencyWeeklyLeaderboardEntry {
  user_id: string
  display_name: string
  weekly_rank: number
  total_points: number
  weekly_record: string
  lock_record: string
  week: number
}

/**
 * Emergency Weekly Leaderboard Service - Works with any database structure
 * 
 * This service tries multiple approaches:
 * 1. TABLE approach (weekly_leaderboard table if populated)
 * 2. VIEW approach (weekly_leaderboard view if exists)
 * 3. Direct picks calculation (always works if picks table exists)
 * 4. Static fallback data
 */
export class EmergencyWeeklyLeaderboardService {
  private static readonly QUERY_TIMEOUT = 5000  // Reduced timeout for faster fallback

  /**
   * Create timeout promise for queries
   */
  private static createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Query timeout after ${ms}ms`)), ms)
    })
  }

  /**
   * Main entry point - tries all strategies
   */
  static async getWeeklyLeaderboard(season: number, week: number): Promise<EmergencyWeeklyLeaderboardEntry[]> {
    console.log('🚨 [WEEKLY EMERGENCY] Starting weekly leaderboard load for season', season, 'week', week)

    // Strategy 1: Try TABLE approach (assumes weekly_leaderboard table is populated)
    try {
      console.log('📊 [WEEKLY STRATEGY 1] Trying TABLE approach...')
      return await this.getTableWeeklyLeaderboard(season, week)
    } catch (error) {
      console.log('❌ [WEEKLY STRATEGY 1] TABLE approach failed:', error.message)
    }

    // Strategy 2: Try VIEW approach (weekly_leaderboard as view)
    try {
      console.log('📊 [WEEKLY STRATEGY 2] Trying VIEW approach...')
      return await this.getViewWeeklyLeaderboard(season, week)
    } catch (error) {
      console.log('❌ [WEEKLY STRATEGY 2] VIEW approach failed:', error.message)
    }

    // Strategy 3: Calculate from picks directly (always works if picks table exists)
    try {
      console.log('📊 [WEEKLY STRATEGY 3] Trying direct picks calculation...')
      return await this.getPicksWeeklyLeaderboard(season, week)
    } catch (error) {
      console.log('❌ [WEEKLY STRATEGY 3] Direct picks failed:', error.message)
    }

    // Strategy 4: Return static data to prevent total failure
    console.log('🚨 [WEEKLY EMERGENCY] All strategies failed, returning static data')
    return this.getStaticWeeklyLeaderboard(week)
  }

  /**
   * Strategy 1: Query weekly_leaderboard as TABLE (if populated)
   */
  private static async getTableWeeklyLeaderboard(season: number, week: number): Promise<EmergencyWeeklyLeaderboardEntry[]> {
    const query = supabase
      .from('weekly_leaderboard')
      .select('user_id, display_name, weekly_rank, total_points, wins, losses, pushes, lock_wins, lock_losses')
      .eq('season', season)
      .eq('week', week)
      .order('weekly_rank', { ascending: true })
      .limit(100)

    const { data, error } = await Promise.race([
      query,
      this.createTimeout(this.QUERY_TIMEOUT)
    ])

    if (error) throw new Error(`WEEKLY TABLE query error: ${error.message}`)
    if (!data || data.length === 0) throw new Error('No weekly TABLE data found')

    console.log('✅ [WEEKLY TABLE] Found', data.length, 'entries')
    return this.formatTableData(data, week)
  }

  /**
   * Strategy 2: Query weekly_leaderboard as VIEW (original schema)
   */
  private static async getViewWeeklyLeaderboard(season: number, week: number): Promise<EmergencyWeeklyLeaderboardEntry[]> {
    const query = supabase
      .from('weekly_leaderboard')
      .select('user_id, display_name, weekly_rank, total_points, wins, losses, pushes, lock_wins, lock_losses')
      .eq('season', season)
      .eq('week', week)
      .order('weekly_rank', { ascending: true })
      .limit(100)

    const { data, error } = await Promise.race([
      query,
      this.createTimeout(this.QUERY_TIMEOUT)
    ])

    if (error) throw new Error(`WEEKLY VIEW query error: ${error.message}`)
    if (!data || data.length === 0) throw new Error('No weekly VIEW data found')

    console.log('✅ [WEEKLY VIEW] Found', data.length, 'entries')
    return this.formatTableData(data, week)
  }

  /**
   * Strategy 3: Calculate weekly leaderboard from picks table directly
   */
  private static async getPicksWeeklyLeaderboard(season: number, week: number): Promise<EmergencyWeeklyLeaderboardEntry[]> {
    console.log('🔢 [WEEKLY PICKS] Computing weekly leaderboard from picks data...')
    
    // Query all picks for the specific week/season
    const query = supabase
      .from('picks')
      .select(`
        user_id,
        result,
        points_earned,
        is_lock,
        users!inner(display_name)
      `)
      .eq('season', season)
      .eq('week', week)
      .not('result', 'is', null) // Only picks with results

    const { data, error } = await Promise.race([
      query,
      this.createTimeout(this.QUERY_TIMEOUT)
    ])

    if (error) throw new Error(`WEEKLY PICKS query error: ${error.message}`)
    if (!data || data.length === 0) throw new Error('No picks data found for this week')

    console.log('✅ [WEEKLY PICKS] Found', data.length, 'picks for week', week)
    return this.formatPicksData(data, season, week)
  }

  /**
   * Strategy 4: Static data to prevent total failure
   */
  private static getStaticWeeklyLeaderboard(week: number): EmergencyWeeklyLeaderboardEntry[] {
    return [
      {
        user_id: 'weekly-emergency-1',
        display_name: `Week ${week} Temporarily Unavailable`,
        weekly_rank: 1,
        total_points: 0,
        weekly_record: '0-0-0',
        lock_record: '0-0',
        week: week
      }
    ]
  }

  /**
   * Format data from TABLE/VIEW queries
   */
  private static formatTableData(data: any[], week: number): EmergencyWeeklyLeaderboardEntry[] {
    return data.map((entry, index) => ({
      user_id: entry.user_id,
      display_name: entry.display_name,
      weekly_rank: entry.weekly_rank || (index + 1),
      total_points: entry.total_points || 0,
      weekly_record: `${entry.wins || 0}-${entry.losses || 0}-${entry.pushes || 0}`,
      lock_record: `${entry.lock_wins || 0}-${entry.lock_losses || 0}`,
      week: week
    }))
  }

  /**
   * Format data from picks query (compute weekly stats)
   */
  private static formatPicksData(data: any[], season: number, week: number): EmergencyWeeklyLeaderboardEntry[] {
    // Group picks by user_id
    const userPicksMap = new Map<string, any[]>()
    
    data.forEach(pick => {
      if (!userPicksMap.has(pick.user_id)) {
        userPicksMap.set(pick.user_id, [])
      }
      userPicksMap.get(pick.user_id)!.push(pick)
    })

    // Calculate stats for each user
    const userStats = Array.from(userPicksMap.entries()).map(([userId, userPicks]) => {
      const displayName = userPicks[0]?.users?.display_name || 'Unknown User'
      
      const stats = {
        user_id: userId,
        display_name: displayName,
        total_wins: userPicks.filter(p => p.result === 'win').length,
        total_losses: userPicks.filter(p => p.result === 'loss').length,
        total_pushes: userPicks.filter(p => p.result === 'push').length,
        lock_wins: userPicks.filter(p => p.result === 'win' && p.is_lock).length,
        lock_losses: userPicks.filter(p => p.result === 'loss' && p.is_lock).length,
        total_points: userPicks.reduce((sum, p) => sum + (p.points_earned || 0), 0)
      }

      return stats
    })

    // Sort by points and add rankings
    userStats.sort((a, b) => b.total_points - a.total_points)

    return userStats.map((stats, index) => ({
      user_id: stats.user_id,
      display_name: stats.display_name,
      weekly_rank: index + 1,
      total_points: stats.total_points,
      weekly_record: `${stats.total_wins}-${stats.total_losses}-${stats.total_pushes}`,
      lock_record: `${stats.lock_wins}-${stats.lock_losses}`,
      week: week
    }))
  }
}