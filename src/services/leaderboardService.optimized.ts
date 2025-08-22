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

/**
 * Optimized LeaderboardService with performance improvements:
 * - Query timeouts to prevent hanging
 * - Fallback strategies for data availability issues  
 * - Composite index usage
 * - Minimal column selection for better performance
 */
export class LeaderboardService {
  private static readonly QUERY_TIMEOUT = 8000 // 8 second timeout
  private static readonly FALLBACK_TIMEOUT = 3000 // 3 second fallback timeout
  private static readonly MAX_RESULTS = 50 // Reasonable limit

  /**
   * Create a timeout promise for database queries
   */
  private static createTimeoutPromise<T>(timeoutMs: number, operation: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operation} timeout after ${timeoutMs/1000}s`))
      }, timeoutMs)
    })
  }

  /**
   * Get season leaderboard with fallback strategies
   */
  static async getSeasonLeaderboard(season: number): Promise<LeaderboardEntry[]> {
    console.log('🏆 [OPTIMIZED] Loading season leaderboard for', season)

    try {
      // Strategy 1: Try verified users only (fastest path)
      return await this.getVerifiedSeasonData(season)
    } catch (error) {
      console.warn('🔄 [FALLBACK] Verified season query failed, trying all users:', error.message)
      
      try {
        // Strategy 2: All users as fallback
        return await this.getAllSeasonData(season)
      } catch (fallbackError) {
        console.error('❌ [EMERGENCY] All season queries failed:', fallbackError.message)
        
        // Strategy 3: Emergency static data
        return this.getEmergencySeasonData()
      }
    }
  }

  /**
   * Get weekly leaderboard with fallback strategies
   */
  static async getWeeklyLeaderboard(season: number, week: number): Promise<LeaderboardEntry[]> {
    console.log('📊 [OPTIMIZED] Loading weekly leaderboard for', season, 'week', week)

    try {
      // Strategy 1: Try verified users only
      return await this.getVerifiedWeeklyData(season, week)
    } catch (error) {
      console.warn('🔄 [FALLBACK] Verified weekly query failed, trying all users:', error.message)
      
      try {
        // Strategy 2: All users as fallback  
        return await this.getAllWeeklyData(season, week)
      } catch (fallbackError) {
        console.error('❌ [EMERGENCY] All weekly queries failed:', fallbackError.message)
        
        // Strategy 3: Emergency static data
        return this.getEmergencyWeeklyData(week)
      }
    }
  }

  /**
   * Get verified season data (primary strategy)
   */
  private static async getVerifiedSeasonData(season: number): Promise<LeaderboardEntry[]> {
    const queryPromise = supabase
      .from('season_leaderboard')
      .select('user_id, display_name, total_points, season_rank, total_wins, total_losses, total_pushes, lock_wins, lock_losses, total_picks')
      .eq('season', season)
      .eq('is_verified', true)
      .order('season_rank', { ascending: true })
      .limit(this.MAX_RESULTS)

    const { data, error } = await Promise.race([
      queryPromise,
      this.createTimeoutPromise(this.QUERY_TIMEOUT, 'Verified season query')
    ])

    if (error) throw error
    if (!data?.length) throw new Error('No verified season data found')

    console.log('✅ [SUCCESS] Found', data.length, 'verified season entries')
    return this.formatSeasonData(data)
  }

  /**
   * Get all season data (fallback strategy)
   */
  private static async getAllSeasonData(season: number): Promise<LeaderboardEntry[]> {
    const queryPromise = supabase
      .from('season_leaderboard')
      .select('user_id, display_name, total_points, season_rank, total_wins, total_losses, total_pushes, lock_wins, lock_losses, total_picks, is_verified')
      .eq('season', season)
      .order('season_rank', { ascending: true })
      .limit(this.MAX_RESULTS)

    const { data, error } = await Promise.race([
      queryPromise,
      this.createTimeoutPromise(this.FALLBACK_TIMEOUT, 'All season query')
    ])

    if (error) throw error
    if (!data?.length) throw new Error('No season data found')

    console.log('🔄 [FALLBACK] Found', data.length, 'total season entries')
    return this.formatSeasonData(data)
  }

  /**
   * Get verified weekly data (primary strategy)
   */
  private static async getVerifiedWeeklyData(season: number, week: number): Promise<LeaderboardEntry[]> {
    const queryPromise = supabase
      .from('weekly_leaderboard')
      .select('user_id, display_name, total_points, weekly_rank, wins, losses, pushes, lock_wins, lock_losses, picks_made')
      .eq('season', season)
      .eq('week', week)
      .eq('is_verified', true)
      .order('weekly_rank', { ascending: true })
      .limit(this.MAX_RESULTS)

    const { data, error } = await Promise.race([
      queryPromise,
      this.createTimeoutPromise(this.QUERY_TIMEOUT, 'Verified weekly query')
    ])

    if (error) throw error
    if (!data?.length) throw new Error('No verified weekly data found')

    console.log('✅ [SUCCESS] Found', data.length, 'verified weekly entries')
    return this.formatWeeklyData(data)
  }

  /**
   * Get all weekly data (fallback strategy)
   */
  private static async getAllWeeklyData(season: number, week: number): Promise<LeaderboardEntry[]> {
    const queryPromise = supabase
      .from('weekly_leaderboard')
      .select('user_id, display_name, total_points, weekly_rank, wins, losses, pushes, lock_wins, lock_losses, picks_made, is_verified')
      .eq('season', season)
      .eq('week', week)
      .order('weekly_rank', { ascending: true })
      .limit(this.MAX_RESULTS)

    const { data, error } = await Promise.race([
      queryPromise,
      this.createTimeoutPromise(this.FALLBACK_TIMEOUT, 'All weekly query')
    ])

    if (error) throw error
    if (!data?.length) throw new Error('No weekly data found')

    console.log('🔄 [FALLBACK] Found', data.length, 'total weekly entries')
    return this.formatWeeklyData(data)
  }

  /**
   * Emergency static data for season (final fallback)
   */
  private static getEmergencySeasonData(): LeaderboardEntry[] {
    console.log('🚨 [EMERGENCY] Returning static season data')
    return [
      {
        user_id: 'emergency-1',
        display_name: 'System Notice',
        weekly_record: '',
        season_record: '0-0-0',
        lock_record: '0-0',
        weekly_points: 0,
        season_points: 0,
        weekly_rank: 0,
        season_rank: 1,
        total_picks: 0,
        total_wins: 0,
        total_losses: 0,
        total_pushes: 0,
        lock_wins: 0,
        lock_losses: 0,
        live_calculated: false
      }
    ]
  }

  /**
   * Emergency static data for weekly (final fallback)
   */
  private static getEmergencyWeeklyData(week: number): LeaderboardEntry[] {
    console.log('🚨 [EMERGENCY] Returning static weekly data for week', week)
    return [
      {
        user_id: 'emergency-1',
        display_name: 'System Notice',
        weekly_record: '0-0-0',
        season_record: '',
        lock_record: '0-0',
        weekly_points: 0,
        season_points: 0,
        weekly_rank: 1,
        season_rank: 0,
        total_picks: 0,
        total_wins: 0,
        total_losses: 0,
        total_pushes: 0,
        lock_wins: 0,
        lock_losses: 0,
        live_calculated: false
      }
    ]
  }

  /**
   * Format season data for frontend consumption
   */
  private static formatSeasonData(data: any[]): LeaderboardEntry[] {
    return data.map(entry => ({
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
      lock_losses: entry.lock_losses || 0,
      live_calculated: true
    }))
  }

  /**
   * Format weekly data for frontend consumption
   */
  private static formatWeeklyData(data: any[]): LeaderboardEntry[] {
    return data.map(entry => ({
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
      lock_losses: entry.lock_losses || 0,
      live_calculated: true
    }))
  }
}