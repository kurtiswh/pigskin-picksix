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
    console.log('🏆 [updateBracketWinners] Starting update for season', season)
    console.log('🏆 [updateBracketWinners] Winner:', bracketWinnerId)
    console.log('🏆 [updateBracketWinners] Second:', bracketSecondId)

    // Use SECURITY DEFINER function to bypass RLS
    const { data, error } = await supabase
      .rpc('update_bracket_winners', {
        p_season: season,
        p_winner_id: bracketWinnerId,
        p_second_id: bracketSecondId
      })

    if (error) {
      console.error('❌ [updateBracketWinners] RPC error:', error)
      throw error
    }

    console.log('✅ [updateBracketWinners] Update successful:', data)
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

    // Get lock leaderboard from season_leaderboard (aggregated data)
    // Calculate lock points: win = 1 point, push = 0.5 points
    const { data: lockData, error: lockError } = await supabase
      .from('season_leaderboard')
      .select('user_id, lock_wins, lock_pushes')
      .eq('season', season)
      .order('lock_wins', { ascending: false })
      .limit(20)

    if (lockError) throw lockError

    // Calculate lock points for each user (win = 1, push = 0.5)
    const lockLeaderboard = lockData?.map(user => ({
      user_id: user.user_id,
      lock_points: (user.lock_wins || 0) + (user.lock_pushes || 0) * 0.5
    })) || []

    // Sort by lock points descending
    lockLeaderboard.sort((a, b) => b.lock_points - a.lock_points)

    // Find highest points and who has them
    const highestPoints = lockLeaderboard[0]?.lock_points
    const winnersWithHighest = lockLeaderboard.filter(user => user.lock_points === highestPoints)

    // Determine winner and second based on ties
    let lockWinner = lockLeaderboard[0]
    let lockSecond = lockLeaderboard[1]

    // If there's a tie at the top, both get winner/second designation
    if (winnersWithHighest.length >= 2) {
      lockWinner = winnersWithHighest[0]
      lockSecond = winnersWithHighest[1]
    }

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
        lock_winner_user_id: lockWinner?.user_id || null,
        lock_second_user_id: lockSecond?.user_id || null,
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

    // Get lock winners from season_leaderboard (aggregated data)
    // Calculate lock points: win = 1 point, push = 0.5 points
    const { data: lockData } = await supabase
      .from('season_leaderboard')
      .select('user_id, display_name, lock_wins, lock_pushes')
      .eq('season', season)
      .order('lock_wins', { ascending: false })
      .limit(20)

    // Calculate lock points for each user (win = 1, push = 0.5)
    const lockLeaderboard = lockData?.map(user => ({
      user_id: user.user_id,
      display_name: user.display_name,
      lock_points: (user.lock_wins || 0) + (user.lock_pushes || 0) * 0.5,
      lock_wins: user.lock_wins || 0,
      lock_pushes: user.lock_pushes || 0
    })) || []

    // Sort by lock points descending
    lockLeaderboard.sort((a, b) => b.lock_points - a.lock_points)

    console.log('🔒 Lock Leaderboard Top 10:', lockLeaderboard.slice(0, 10))

    // Find highest points and all users with that score
    const highestPoints = lockLeaderboard[0]?.lock_points
    const winnersWithHighest = lockLeaderboard.filter(user => user.lock_points === highestPoints)

    console.log('🔒 Highest Lock Points:', highestPoints)
    console.log('🔒 Users with Highest:', winnersWithHighest)

    // Determine winner and second based on ties
    // If there's a tie at the top, both tied players are winner and second
    const lockWinners = winnersWithHighest.length >= 2
      ? [[winnersWithHighest[0].user_id, winnersWithHighest[0].lock_points], [winnersWithHighest[1].user_id, winnersWithHighest[1].lock_points]]
      : [[lockLeaderboard[0]?.user_id, lockLeaderboard[0]?.lock_points], [lockLeaderboard[1]?.user_id, lockLeaderboard[1]?.lock_points]]

    console.log('🔒 Final Lock Winners:', lockWinners)

    // Get best finish winner
    const { data: bestFinishWinner } = await supabase
      .from('best_finish_leaderboard')
      .select('user_id, display_name')
      .eq('season', season)
      .order('rank', { ascending: true })
      .limit(1)
      .single()

    // Get weekly winners by fetching top players for each week (1-14)
    // This handles ties properly by finding max points and including all players with that score
    const weeklyWinnersPromises = []
    for (let week = 1; week <= 14; week++) {
      weeklyWinnersPromises.push(
        supabase
          .from('weekly_leaderboard')
          .select('week, user_id, display_name, total_points')
          .eq('season', season)
          .eq('week', week)
          .order('total_points', { ascending: false })
          .limit(10)  // Get top 10 to catch any ties at the top
      )
    }

    const weeklyResults = await Promise.all(weeklyWinnersPromises)

    // Find max points for each week and filter to only include winners
    const weeklyWinners: Array<{week: number, user_id: string, display_name: string, total_points: number}> = []
    weeklyResults.forEach(({ data }, index) => {
      const week = index + 1
      if (data && data.length > 0) {
        const maxPoints = data[0].total_points
        // Include all players with max points (handles ties)
        const winners = data.filter(row => row.total_points === maxPoints)
        weeklyWinners.push(...winners)
      }
    })

    console.log('🏆 Weekly winners (max points per week):', {
      count: weeklyWinners?.length,
      weeksCovered: [...new Set(weeklyWinners.map(w => w.week))].length,
      data: weeklyWinners
    })

    // Get bracket winners from database (admin-set)
    console.log('🔍 [getLiveWinners] Fetching bracket winners for season', season)
    const { data: seasonWinners, error: seasonWinnersError } = await supabase
      .from('season_winners')
      .select('bracket_winner_user_id, bracket_second_user_id, total_pot, weekly_payout, is_finalized')
      .eq('season', season)
      .single()

    if (seasonWinnersError) {
      console.log('⚠️ [getLiveWinners] Error fetching season_winners:', seasonWinnersError)
    } else {
      console.log('✅ [getLiveWinners] Season winners data:', seasonWinners)
    }

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

    // Check if lock winners are tied (same points)
    const lockWinnerPoints = lockWinners[0]?.[1]
    const lockSecondPoints = lockWinners[1]?.[1]
    const lockIsTied = lockWinnerPoints === lockSecondPoints && lockWinnerPoints !== undefined

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
      lock_is_tied: lockIsTied,
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
    // Prefer the stored, finalized season_winners row (authoritative — this is
    // how historic seasons, incl. pre-2016 standings-only years, are recorded).
    // Fall back to live calculation for the in-progress season (not yet stored).
    const { data: stored } = await supabase
      .from('season_winners')
      .select('*')
      .eq('season', season)
      .maybeSingle()

    const populated = stored && (stored.point_winner_user_id || stored.is_finalized)
    if (!populated) {
      return this.getLiveWinnersFromLeaderboards(season)
    }

    const idFields = [
      'point_winner_user_id', 'point_second_user_id', 'point_third_user_id',
      'point_fourth_user_id', 'point_fifth_user_id', 'point_sixth_user_id',
      'point_seventh_user_id', 'point_eighth_user_id', 'point_ninth_user_id',
      'point_tenth_user_id', 'lock_winner_user_id', 'lock_second_user_id',
      'bracket_winner_user_id', 'bracket_second_user_id', 'best_finish_user_id',
    ]
    const ids = new Set<string>()
    idFields.forEach(f => { if (stored[f]) ids.add(stored[f]) })
    ;(stored.weekly_winners || []).forEach((w: any) => { if (w?.user_id) ids.add(w.user_id) })

    const { data: users } = ids.size
      ? await supabase.from('users').select('id, display_name').in('id', [...ids])
      : { data: [] as any[] }
    const userMap = new Map((users || []).map((u: any) => [u.id, u.display_name]))

    return { winners: stored, userMap, payoutStructure: PAYOUT_PERCENTAGES }
  }
}
