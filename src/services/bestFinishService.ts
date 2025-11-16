/**
 * Best Finish Leaderboard Service
 * Handles data fetching for the 4th quarter championship (weeks 11-14)
 */

import { supabase } from '@/lib/supabase'

export interface BestFinishEntry {
  userId: string
  displayName: string
  leaguesafeEmail: string | null
  paymentStatus: 'paid' | 'pending' | 'not_paid'
  season: number
  weeksIncluded: number[]
  totalPoints: number
  totalWins: number
  totalLosses: number
  totalPushes: number
  lockWins: number
  lockLosses: number
  lockPushes: number
  totalPicks: number
  winPercentage: number
  lockWinPercentage: number
  worstWeekScore: number
  record: string  // "W-L-P" format
  lockRecord: string  // "W-L-P" format
  rank: number
}

export interface BestFinishWeeklyDetail {
  week: number
  picksCount: number
  points: number
  wins: number
  losses: number
  pushes: number
  lockWins: number
  lockLosses: number
  lockPushes: number
  record: string
  lockRecord: string
}

export class BestFinishService {
  /**
   * Get Best Finish leaderboard for a season
   */
  static async getBestFinishLeaderboard(season: number): Promise<BestFinishEntry[]> {
    try {
      console.log(`📊 Fetching Best Finish leaderboard for season ${season}`)

      const { data, error } = await supabase
        .from('best_finish_leaderboard')
        .select('*')
        .eq('season', season)
        .order('rank', { ascending: true })

      if (error) throw error

      if (!data) {
        console.log('No Best Finish data found')
        return []
      }

      console.log(`✅ Loaded ${data.length} Best Finish entries`)

      return data.map(entry => ({
        userId: entry.user_id,
        displayName: entry.display_name,
        leaguesafeEmail: entry.leaguesafe_email,
        paymentStatus: entry.payment_status,
        season: entry.season,
        weeksIncluded: entry.weeks_included || [],
        totalPoints: entry.total_points || 0,
        totalWins: entry.total_wins || 0,
        totalLosses: entry.total_losses || 0,
        totalPushes: entry.total_pushes || 0,
        lockWins: entry.lock_wins || 0,
        lockLosses: entry.lock_losses || 0,
        lockPushes: entry.lock_pushes || 0,
        totalPicks: entry.total_picks || 0,
        winPercentage: entry.win_percentage || 0,
        lockWinPercentage: entry.lock_win_percentage || 0,
        worstWeekScore: entry.worst_week_score || 0,
        record: entry.record || '0-0-0',
        lockRecord: entry.lock_record || '0-0-0',
        rank: entry.rank || 0
      }))

    } catch (error: any) {
      console.error('❌ Error fetching Best Finish leaderboard:', error.message)
      throw new Error(`Failed to load Best Finish leaderboard: ${error.message}`)
    }
  }

  /**
   * Get week-by-week breakdown for a specific user
   */
  static async getBestFinishDetails(
    userId: string,
    season: number
  ): Promise<BestFinishWeeklyDetail[]> {
    try {
      console.log(`📋 Fetching Best Finish details for user ${userId}, season ${season}`)

      const { data, error } = await supabase
        .rpc('get_best_finish_details', {
          user_id_param: userId,
          season_param: season
        })

      if (error) throw error

      if (!data) {
        console.log('No weekly details found')
        return []
      }

      console.log(`✅ Loaded ${data.length} weeks of Best Finish details`)

      return data.map((week: any) => ({
        week: week.week,
        picksCount: week.picks_count || 0,
        points: week.points || 0,
        wins: week.wins || 0,
        losses: week.losses || 0,
        pushes: week.pushes || 0,
        lockWins: week.lock_wins || 0,
        lockLosses: week.lock_losses || 0,
        lockPushes: week.lock_pushes || 0,
        record: week.record || '0-0-0',
        lockRecord: week.lock_record || '0-0-0'
      }))

    } catch (error: any) {
      console.error('❌ Error fetching Best Finish details:', error.message)
      throw new Error(`Failed to load Best Finish details: ${error.message}`)
    }
  }

  /**
   * Get Best Finish status (which weeks are eligible)
   */
  static async getBestFinishWeeks(season: number): Promise<number[]> {
    try {
      const { data, error } = await supabase
        .from('week_settings')
        .select('week')
        .eq('season', season)
        .eq('best_finish_eligible', true)
        .order('week', { ascending: true })

      if (error) throw error

      return (data || []).map(w => w.week)
    } catch (error: any) {
      console.error('❌ Error fetching Best Finish weeks:', error.message)
      // Default to weeks 11-14 if query fails
      return [11, 12, 13, 14]
    }
  }

  /**
   * Export Best Finish leaderboard to CSV
   */
  static async exportToCSV(season: number): Promise<string> {
    const leaderboard = await this.getBestFinishLeaderboard(season)

    const headers = [
      'Rank',
      'Player',
      'Total Points',
      'Record',
      'Win %',
      'Lock Record',
      'Lock Win %',
      'Worst Week Score',
      'Weeks Included',
      'Payment Status'
    ]

    const rows = leaderboard.map(entry => [
      entry.rank,
      entry.displayName,
      entry.totalPoints,
      entry.record,
      (entry.winPercentage * 100).toFixed(1) + '%',
      entry.lockRecord,
      (entry.lockWinPercentage * 100).toFixed(1) + '%',
      entry.worstWeekScore,
      entry.weeksIncluded.join(', '),
      entry.paymentStatus
    ])

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')

    return csv
  }

  /**
   * Download CSV file
   */
  static downloadCSV(csv: string, filename: string = 'best-finish-leaderboard.csv') {
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    window.URL.revokeObjectURL(url)
  }
}
