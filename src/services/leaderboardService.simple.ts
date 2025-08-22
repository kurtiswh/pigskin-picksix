import { supabase } from '@/lib/supabase'

export interface SimpleLeaderboardEntry {
  user_id: string
  display_name: string
  season_rank: number
  total_points: number
  season_record: string
  lock_record: string
}

export class SimpleLeaderboardService {
  /**
   * Get season leaderboard - no timeouts, no fallbacks, just the data
   */
  static async getSeasonLeaderboard(season: number): Promise<SimpleLeaderboardEntry[]> {
    console.log('📊 [SIMPLE] Getting season leaderboard for', season)

    const { data, error } = await supabase
      .from('season_leaderboard')
      .select('user_id, display_name, season_rank, total_points, total_wins, total_losses, total_pushes, lock_wins, lock_losses')
      .eq('season', season)
      .order('season_rank', { ascending: true })
      .limit(50)

    if (error) {
      console.error('❌ [SIMPLE] Query error:', error)
      throw error
    }

    if (!data || data.length === 0) {
      console.log('📊 [SIMPLE] No data found for season', season)
      return []
    }

    console.log('✅ [SIMPLE] Found', data.length, 'entries')

    return data.map(entry => ({
      user_id: entry.user_id,
      display_name: entry.display_name,
      season_rank: entry.season_rank || 0,
      total_points: entry.total_points || 0,
      season_record: `${entry.total_wins || 0}-${entry.total_losses || 0}-${entry.total_pushes || 0}`,
      lock_record: `${entry.lock_wins || 0}-${entry.lock_losses || 0}`
    }))
  }
}