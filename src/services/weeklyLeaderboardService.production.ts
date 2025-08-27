import { ENV } from '@/lib/env'

export interface ProductionWeeklyLeaderboardEntry {
  user_id: string
  display_name: string
  weekly_rank: number
  total_points: number
  weekly_record: string
  lock_record: string
  week: number
  pick_source?: 'authenticated' | 'anonymous' | 'mixed'
}

/**
 * Production-Optimized Weekly Leaderboard Service
 * 
 * Uses direct REST API calls to bypass Supabase client issues in production.
 * This service applies the same optimization pattern that fixed the season leaderboard.
 */
export class ProductionWeeklyLeaderboardService {
  private static readonly API_TIMEOUT = 3000 // 3 seconds max
  private static readonly supabaseUrl = ENV.SUPABASE_URL || ''
  private static readonly supabaseKey = ENV.SUPABASE_ANON_KEY || ''

  /**
   * Get weekly leaderboard using direct REST API (fastest, most reliable)
   */
  static async getWeeklyLeaderboard(season: number, week: number): Promise<ProductionWeeklyLeaderboardEntry[]> {
    console.log('🚀 [WEEKLY PRODUCTION] Using direct REST API for maximum reliability')
    
    const startTime = Date.now()
    
    try {
      // Create timeout controller
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort()
      }, this.API_TIMEOUT)

      // Direct REST API call to Supabase weekly_leaderboard table with pick_source filtering
      const response = await fetch(
        `${this.supabaseUrl}/rest/v1/weekly_leaderboard?select=user_id,display_name,weekly_rank,total_points,wins,losses,pushes,lock_wins,lock_losses,pick_source&season=eq.${season}&week=eq.${week}&or=(is_verified.eq.true,pick_source.eq.anonymous,pick_source.eq.mixed)&order=weekly_rank.asc&limit=200`,
        {
          headers: {
            'apikey': this.supabaseKey,
            'Authorization': `Bearer ${this.supabaseKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          signal: controller.signal
        }
      )

      clearTimeout(timeoutId)
      const duration = Date.now() - startTime

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      console.log(`✅ [WEEKLY PRODUCTION] Direct API success: ${duration}ms, ${data.length} entries`)

      // Format data to match expected interface
      return this.formatData(data, week)

    } catch (error: any) {
      const duration = Date.now() - startTime
      console.log(`❌ [WEEKLY PRODUCTION] Direct API failed after ${duration}ms:`, error.message)
      
      // Return static data instead of throwing
      return this.getStaticWeeklyLeaderboard(week)
    }
  }

  /**
   * Format raw API data to match expected interface
   */
  private static formatData(data: any[], week: number): ProductionWeeklyLeaderboardEntry[] {
    return data.map(entry => ({
      user_id: entry.user_id,
      display_name: entry.display_name,
      weekly_rank: entry.weekly_rank || 0,
      total_points: entry.total_points || 0,
      weekly_record: `${entry.wins || 0}-${entry.losses || 0}-${entry.pushes || 0}`,
      lock_record: `${entry.lock_wins || 0}-${entry.lock_losses || 0}`,
      week: week,
      pick_source: entry.pick_source || 'authenticated'
    }))
  }

  /**
   * Static fallback data for when API fails
   */
  private static getStaticWeeklyLeaderboard(week: number): ProductionWeeklyLeaderboardEntry[] {
    return [
      {
        user_id: 'weekly-production-static-1',
        display_name: `Week ${week} Data Loading...`,
        weekly_rank: 1,
        total_points: 0,
        weekly_record: '0-0-0',
        lock_record: '0-0',
        week: week
      }
    ]
  }
}