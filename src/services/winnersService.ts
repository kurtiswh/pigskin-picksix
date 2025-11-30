import { supabase } from '@/lib/supabase'
import { SeasonWinners, PAYOUT_PERCENTAGES } from '@/types/winners'

export class WinnersService {
  /**
   * Get season winners for a given season
   */
  static async getSeasonWinners(season: number): Promise<SeasonWinners | null> {
    const { data, error } = await supabase
      .from('season_winners')
      .select('*')
      .eq('season', season)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No row exists yet
        return null
      }
      throw error
    }

    return data
  }

  /**
   * Update bracket winners (admin only)
   */
  static async updateBracketWinners(
    season: number,
    bracketWinnerId: string | null,
    bracketSecondId: string | null
  ): Promise<void> {
    // First, ensure a row exists for this season
    const { error: rpcError } = await supabase
      .rpc('get_or_create_season_winners', { p_season: season })

    if (rpcError) {
      throw rpcError
    }

    // Update bracket winners
    const { error } = await supabase
      .from('season_winners')
      .update({
        bracket_winner_user_id: bracketWinnerId,
        bracket_second_user_id: bracketSecondId
      })
      .eq('season', season)

    if (error) {
      throw error
    }
  }

  /**
   * Calculate and update point/lock/best finish winners from leaderboard data
   * This should be run after the season is complete
   */
  static async calculateAndUpdateWinners(season: number): Promise<void> {
    // Get season leaderboard (top 10)
    const { data: seasonData, error: seasonError } = await supabase
      .from('season_leaderboard')
      .select('user_id, display_name, season_points')
      .eq('season', season)
      .order('season_rank', { ascending: true })
      .limit(10)

    if (seasonError) throw seasonError

    // Get lock leaderboard (top 2)
    const { data: lockData, error: lockError } = await supabase
      .from('picks')
      .select('user_id, is_lock, result')
      .eq('season', season)
      .eq('is_lock', true)
      .not('result', 'is', null)

    if (lockError) throw lockError

    // Calculate lock winners
    const lockWins = new Map<string, number>()
    lockData?.forEach(pick => {
      if (pick.result === 'win') {
        lockWins.set(pick.user_id, (lockWins.get(pick.user_id) || 0) + 1)
      }
    })

    const lockWinners = Array.from(lockWins.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)

    // Get Best Finish winner
    const { data: bestFinishData, error: bestFinishError } = await supabase
      .from('best_finish_leaderboard')
      .select('user_id')
      .eq('season', season)
      .order('rank', { ascending: true })
      .limit(1)
      .single()

    if (bestFinishError && bestFinishError.code !== 'PGRST116') {
      throw bestFinishError
    }

    // Ensure row exists
    const { error: rpcError } = await supabase
      .rpc('get_or_create_season_winners', { p_season: season })

    if (rpcError) throw rpcError

    // Update all calculated winners
    const { error } = await supabase
      .from('season_winners')
      .update({
        point_winner_user_id: seasonData?.[0]?.user_id || null,
        point_second_user_id: seasonData?.[1]?.user_id || null,
        point_third_user_id: seasonData?.[2]?.user_id || null,
        point_fourth_user_id: seasonData?.[3]?.user_id || null,
        point_fifth_user_id: seasonData?.[4]?.user_id || null,
        point_sixth_user_id: seasonData?.[5]?.user_id || null,
        point_seventh_user_id: seasonData?.[6]?.user_id || null,
        point_eighth_user_id: seasonData?.[7]?.user_id || null,
        point_ninth_user_id: seasonData?.[8]?.user_id || null,
        point_tenth_user_id: seasonData?.[9]?.user_id || null,
        lock_winner_user_id: lockWinners[0]?.[0] || null,
        lock_second_user_id: lockWinners[1]?.[0] || null,
        best_finish_user_id: bestFinishData?.user_id || null
      })
      .eq('season', season)

    if (error) throw error
  }

  /**
   * Update weekly winners as each week completes
   */
  static async updateWeeklyWinners(season: number): Promise<void> {
    // Get all weekly winners from weekly_leaderboard
    const { data: weeklyData, error: weeklyError } = await supabase
      .from('weekly_leaderboard')
      .select('week, user_id')
      .eq('season', season)
      .eq('weekly_rank', 1)
      .order('week', { ascending: true })

    if (weeklyError) throw weeklyError

    // Ensure row exists
    const { error: rpcError } = await supabase
      .rpc('get_or_create_season_winners', { p_season: season })

    if (rpcError) throw rpcError

    // Format weekly winners
    const weeklyWinners = weeklyData?.map(w => ({
      week: w.week,
      user_id: w.user_id
    })) || []

    // Update weekly winners
    const { error } = await supabase
      .from('season_winners')
      .update({ weekly_winners: weeklyWinners })
      .eq('season', season)

    if (error) throw error
  }

  /**
   * Set total pot for season (used to calculate dollar amounts)
   */
  static async setTotalPot(season: number, totalPot: number): Promise<void> {
    // Ensure row exists
    const { error: rpcError } = await supabase
      .rpc('get_or_create_season_winners', { p_season: season })

    if (rpcError) throw rpcError

    const { error } = await supabase
      .from('season_winners')
      .update({ total_pot: totalPot })
      .eq('season', season)

    if (error) throw error
  }

  /**
   * Finalize winners (lock them in)
   */
  static async finalizeWinners(season: number): Promise<void> {
    const { error } = await supabase
      .from('season_winners')
      .update({ is_finalized: true })
      .eq('season', season)

    if (error) throw error
  }

  /**
   * Calculate payout amount for a given percentage and total pot
   */
  static calculatePayout(percentage: number, totalPot: number, weeklyTotal: number): number {
    const adjustedPot = totalPot - weeklyTotal
    return (adjustedPot * percentage) / 100
  }

  /**
   * Get display-friendly winner data with user names
   */
  static async getWinnersWithNames(season: number) {
    const winners = await this.getSeasonWinners(season)
    if (!winners) return null

    // Get all unique user IDs
    const userIds = new Set<string>()
    Object.entries(winners).forEach(([key, value]) => {
      if (key.includes('user_id') && value) {
        userIds.add(value as string)
      }
    })

    // Fetch user display names
    const { data: users } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', Array.from(userIds))

    const userMap = new Map(users?.map(u => [u.id, u.display_name]) || [])

    return {
      winners,
      userMap,
      payoutStructure: PAYOUT_PERCENTAGES
    }
  }
}
