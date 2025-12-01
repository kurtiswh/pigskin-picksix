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
      .select('user_id, display_name, total_points')
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
    console.log('🏆 Starting updateWeeklyWinners for season', season)

    // Get all weekly winners from weekly_leaderboard
    const { data: weeklyData, error: weeklyError } = await supabase
      .from('weekly_leaderboard')
      .select('week, user_id')
      .eq('season', season)
      .eq('weekly_rank', 1)
      .order('week', { ascending: true })

    if (weeklyError) {
      console.error('❌ Error fetching weekly winners:', weeklyError)
      throw weeklyError
    }

    console.log(`✅ Found ${weeklyData?.length || 0} weekly winners`)
    console.log('Weekly data:', weeklyData)

    // Ensure row exists
    console.log('📝 Ensuring season_winners row exists...')
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('get_or_create_season_winners', { p_season: season })

    if (rpcError) {
      console.error('❌ RPC error:', rpcError)
      throw rpcError
    }

    console.log('✅ Season winners row ID:', rpcData)

    // Format weekly winners
    const weeklyWinners = weeklyData?.map(w => ({
      week: w.week,
      user_id: w.user_id
    })) || []

    console.log('📝 Updating with weekly winners:', weeklyWinners)

    // Update weekly winners
    const { data: updateData, error } = await supabase
      .from('season_winners')
      .update({ weekly_winners: weeklyWinners })
      .eq('season', season)
      .select()

    if (error) {
      console.error('❌ Update error:', error)
      throw error
    }

    console.log('✅ Weekly winners updated successfully!')
    console.log('Updated data:', updateData)
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
   * Get live winners calculated from leaderboards (no database writes needed)
   */
  static async getLiveWinnersFromLeaderboards(season: number) {
    // Get point winners from season_leaderboard (top 10)
    const { data: pointWinners } = await supabase
      .from('season_leaderboard')
      .select('user_id, display_name, total_points, season_rank')
      .eq('season', season)
      .order('season_rank', { ascending: true })
      .limit(10)

    // Get lock winners from picks
    const { data: lockData } = await supabase
      .from('picks')
      .select('user_id, is_lock, result')
      .eq('season', season)
      .eq('is_lock', true)
      .eq('result', 'win')

    // Calculate lock wins per user
    const lockWins = new Map<string, number>()
    lockData?.forEach(pick => {
      lockWins.set(pick.user_id, (lockWins.get(pick.user_id) || 0) + 1)
    })
    const lockWinners = Array.from(lockWins.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)

    // Get best finish winner
    const { data: bestFinishWinner } = await supabase
      .from('best_finish_leaderboard')
      .select('user_id, display_name')
      .eq('season', season)
      .order('rank', { ascending: true })
      .limit(1)
      .single()

    // Get weekly winners (including all tied for 1st place)
    const { data: weeklyWinners } = await supabase
      .from('weekly_leaderboard')
      .select('week, user_id, display_name, total_points, weekly_rank')
      .eq('season', season)
      .eq('weekly_rank', 1)
      .order('week', { ascending: true })

    // Get bracket winners from database (admin-set)
    const { data: seasonWinners } = await supabase
      .from('season_winners')
      .select('bracket_winner_user_id, bracket_second_user_id, total_pot, weekly_payout, is_finalized')
      .eq('season', season)
      .single()

    // Get user display names for lock winners
    const lockUserIds = lockWinners.map(([userId]) => userId)
    const { data: lockUsers } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', lockUserIds)

    const lockUserMap = new Map(lockUsers?.map(u => [u.id, u.display_name]) || [])

    // Build bracket winner map
    const bracketUserIds = [
      seasonWinners?.bracket_winner_user_id,
      seasonWinners?.bracket_second_user_id
    ].filter(Boolean) as string[]

    const { data: bracketUsers } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', bracketUserIds)

    const bracketUserMap = new Map(bracketUsers?.map(u => [u.id, u.display_name]) || [])

    // Build comprehensive user map
    const allUserMap = new Map<string, string>()

    // Add point winners
    pointWinners?.forEach(p => allUserMap.set(p.user_id, p.display_name))

    // Add lock winners
    lockUserMap.forEach((name, id) => allUserMap.set(id, name))

    // Add best finish
    if (bestFinishWinner) {
      allUserMap.set(bestFinishWinner.user_id, bestFinishWinner.display_name)
    }

    // Add weekly winners
    weeklyWinners?.forEach(w => allUserMap.set(w.user_id, w.display_name))

    // Add bracket winners
    bracketUserMap.forEach((name, id) => allUserMap.set(id, name))

    // Build live winners object
    const liveWinners = {
      id: seasonWinners?.id || 'live',
      season,
      point_winner_user_id: pointWinners?.[0]?.user_id || null,
      point_second_user_id: pointWinners?.[1]?.user_id || null,
      point_third_user_id: pointWinners?.[2]?.user_id || null,
      point_fourth_user_id: pointWinners?.[3]?.user_id || null,
      point_fifth_user_id: pointWinners?.[4]?.user_id || null,
      point_sixth_user_id: pointWinners?.[5]?.user_id || null,
      point_seventh_user_id: pointWinners?.[6]?.user_id || null,
      point_eighth_user_id: pointWinners?.[7]?.user_id || null,
      point_ninth_user_id: pointWinners?.[8]?.user_id || null,
      point_tenth_user_id: pointWinners?.[9]?.user_id || null,
      lock_winner_user_id: lockWinners[0]?.[0] || null,
      lock_second_user_id: lockWinners[1]?.[0] || null,
      bracket_winner_user_id: seasonWinners?.bracket_winner_user_id || null,
      bracket_second_user_id: seasonWinners?.bracket_second_user_id || null,
      best_finish_user_id: bestFinishWinner?.user_id || null,
      weekly_winners: weeklyWinners?.map(w => ({
        week: w.week,
        user_id: w.user_id,
        display_name: w.display_name,
        total_points: w.total_points
      })) || [],
      total_pot: seasonWinners?.total_pot || null,
      weekly_payout: seasonWinners?.weekly_payout || 80,
      is_finalized: seasonWinners?.is_finalized || false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    return {
      winners: liveWinners,
      userMap: allUserMap,
      payoutStructure: PAYOUT_PERCENTAGES
    }
  }

  /**
   * Get display-friendly winner data with user names
   */
  static async getWinnersWithNames(season: number) {
    // Use live calculation from leaderboards instead of stored data
    return this.getLiveWinnersFromLeaderboards(season)
  }
}
