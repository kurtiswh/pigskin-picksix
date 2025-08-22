import { supabase } from '@/lib/supabase'

export interface EmergencyLeaderboardEntry {
  user_id: string
  display_name: string
  season_rank: number
  total_points: number
  season_record: string
  lock_record: string
}

/**
 * Emergency Leaderboard Service - Works with any database structure
 * 
 * This service tries multiple approaches:
 * 1. TABLE approach (new schema)
 * 2. VIEW approach (original schema) 
 * 3. Direct picks query (always works)
 */
export class EmergencyLeaderboardService {
  private static readonly QUERY_TIMEOUT = 8000

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
  static async getSeasonLeaderboard(season: number): Promise<EmergencyLeaderboardEntry[]> {
    console.log('🚨 [EMERGENCY] Starting leaderboard load for season', season)

    // Strategy 1: Try TABLE approach (assumes migrations were applied)
    try {
      console.log('📊 [STRATEGY 1] Trying TABLE approach...')
      return await this.getTableLeaderboard(season)
    } catch (error) {
      console.log('❌ [STRATEGY 1] TABLE approach failed:', error.message)
    }

    // Strategy 2: Try VIEW approach (original schema)
    try {
      console.log('📊 [STRATEGY 2] Trying VIEW approach...')
      return await this.getViewLeaderboard(season)
    } catch (error) {
      console.log('❌ [STRATEGY 2] VIEW approach failed:', error.message)
    }

    // Strategy 3: Direct picks query (always works if picks table exists)
    try {
      console.log('📊 [STRATEGY 3] Trying direct picks query...')
      return await this.getPicksLeaderboard(season)
    } catch (error) {
      console.log('❌ [STRATEGY 3] Direct picks failed:', error.message)
    }

    // Strategy 4: Return static data to prevent total failure
    console.log('🚨 [EMERGENCY] All strategies failed, returning static data')
    return this.getStaticLeaderboard()
  }

  /**
   * Strategy 1: Query season_leaderboard as TABLE (new schema)
   */
  private static async getTableLeaderboard(season: number): Promise<EmergencyLeaderboardEntry[]> {
    const query = supabase
      .from('season_leaderboard')
      .select('user_id, display_name, season_rank, total_points, total_wins, total_losses, total_pushes, lock_wins, lock_losses')
      .eq('season', season)
      .order('season_rank', { ascending: true })
      .limit(50)

    const { data, error } = await Promise.race([
      query,
      this.createTimeout(this.QUERY_TIMEOUT)
    ])

    if (error) throw new Error(`TABLE query error: ${error.message}`)
    if (!data || data.length === 0) throw new Error('No TABLE data found')

    console.log('✅ [TABLE] Found', data.length, 'entries')
    return this.formatTableData(data)
  }

  /**
   * Strategy 2: Query season_leaderboard as VIEW (original schema)
   */
  private static async getViewLeaderboard(season: number): Promise<EmergencyLeaderboardEntry[]> {
    // Original VIEW doesn't have is_verified column, so we can't filter by it
    const query = supabase
      .from('season_leaderboard')
      .select('user_id, display_name, season_rank, total_points, total_wins, total_losses, total_pushes, lock_wins, lock_losses')
      .eq('season', season)
      .order('season_rank', { ascending: true })
      .limit(50)

    const { data, error } = await Promise.race([
      query,
      this.createTimeout(this.QUERY_TIMEOUT)
    ])

    if (error) throw new Error(`VIEW query error: ${error.message}`)
    if (!data || data.length === 0) throw new Error('No VIEW data found')

    console.log('✅ [VIEW] Found', data.length, 'entries')
    return this.formatTableData(data)
  }

  /**
   * Strategy 3: Query picks table directly and compute leaderboard
   */
  private static async getPicksLeaderboard(season: number): Promise<EmergencyLeaderboardEntry[]> {
    // This query computes the leaderboard directly from picks - always works
    const query = supabase.rpc('get_emergency_leaderboard', { 
      target_season: season 
    })

    // If RPC function doesn't exist, fall back to raw SQL approach
    let result
    try {
      result = await Promise.race([
        query,
        this.createTimeout(this.QUERY_TIMEOUT)
      ])
    } catch (rpcError) {
      console.log('RPC failed, trying raw query approach...')
      
      // Raw query as fallback
      const rawQuery = supabase
        .from('users')
        .select(`
          id,
          display_name,
          picks!inner(season, result, points_earned, is_lock)
        `)
        .eq('picks.season', season)
        .not('picks.result', 'is', null)

      result = await Promise.race([
        rawQuery,
        this.createTimeout(this.QUERY_TIMEOUT)
      ])
    }

    const { data, error } = result

    if (error) throw new Error(`PICKS query error: ${error.message}`)
    if (!data || data.length === 0) throw new Error('No picks data found')

    console.log('✅ [PICKS] Found', data.length, 'users with picks')
    return this.formatPicksData(data, season)
  }

  /**
   * Strategy 4: Static data to prevent total failure
   */
  private static getStaticLeaderboard(): EmergencyLeaderboardEntry[] {
    return [
      {
        user_id: 'emergency-1',
        display_name: 'Leaderboard Temporarily Unavailable',
        season_rank: 1,
        total_points: 0,
        season_record: '0-0-0',
        lock_record: '0-0'
      }
    ]
  }

  /**
   * Format data from TABLE/VIEW queries
   */
  private static formatTableData(data: any[]): EmergencyLeaderboardEntry[] {
    return data.map((entry, index) => ({
      user_id: entry.user_id,
      display_name: entry.display_name,
      season_rank: entry.season_rank || (index + 1),
      total_points: entry.total_points || 0,
      season_record: `${entry.total_wins || 0}-${entry.total_losses || 0}-${entry.total_pushes || 0}`,
      lock_record: `${entry.lock_wins || 0}-${entry.lock_losses || 0}`
    }))
  }

  /**
   * Format data from picks query (compute stats)
   */
  private static formatPicksData(data: any[], season: number): EmergencyLeaderboardEntry[] {
    const userStats = data.map(user => {
      const userPicks = user.picks?.filter((p: any) => p.season === season && p.result) || []
      
      const stats = {
        user_id: user.id,
        display_name: user.display_name,
        total_wins: userPicks.filter((p: any) => p.result === 'win').length,
        total_losses: userPicks.filter((p: any) => p.result === 'loss').length,
        total_pushes: userPicks.filter((p: any) => p.result === 'push').length,
        lock_wins: userPicks.filter((p: any) => p.result === 'win' && p.is_lock).length,
        lock_losses: userPicks.filter((p: any) => p.result === 'loss' && p.is_lock).length,
        total_points: userPicks.reduce((sum: number, p: any) => sum + (p.points_earned || 0), 0)
      }

      return stats
    })

    // Sort by points and add rankings
    userStats.sort((a, b) => b.total_points - a.total_points)

    return userStats.map((stats, index) => ({
      user_id: stats.user_id,
      display_name: stats.display_name,
      season_rank: index + 1,
      total_points: stats.total_points,
      season_record: `${stats.total_wins}-${stats.total_losses}-${stats.total_pushes}`,
      lock_record: `${stats.lock_wins}-${stats.lock_losses}`
    }))
  }
}