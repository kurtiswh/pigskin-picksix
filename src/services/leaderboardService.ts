import { supabase } from '@/lib/supabase'
import { calculatePickResult } from './scoreCalculation'

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
  live_calculated?: boolean // Indicates if scores were calculated on-demand
}

export interface GameResult {
  id: string
  week: number
  season: number
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  spread: number
  status: 'scheduled' | 'in_progress' | 'completed'
  base_points?: number
  margin_bonus?: number
}

export interface PickResult {
  user_id: string
  game_id: string
  week: number
  season: number
  selected_team: string
  is_lock: boolean
  result: 'win' | 'loss' | 'push' | null
  points_earned: number | null
}

export class LeaderboardService {
  private static readonly TIMEOUT = 10000

  /**
   * Calculate points for a pick based on game result
   */
  private static calculatePickPoints(
    pick: { selected_team: string; is_lock: boolean },
    game: GameResult
  ): { result: 'win' | 'loss' | 'push'; points: number } {
    if (game.status !== 'completed' || game.home_score === null || game.away_score === null) {
      return { result: 'loss', points: 0 }
    }

    const homeScoreWithSpread = game.home_score + game.spread
    const awayScoreWithSpread = game.away_score - game.spread

    // Check for push (tie)
    if (homeScoreWithSpread === game.away_score) {
      return { result: 'push', points: 10 }
    }

    // Determine winner
    const homeWon = homeScoreWithSpread > game.away_score
    const awayWon = awayScoreWithSpread > game.home_score
    const pickWon = (pick.selected_team === game.home_team && homeWon) || 
                   (pick.selected_team === game.away_team && awayWon)

    if (!pickWon) {
      return { result: 'loss', points: 0 }
    }

    // Calculate margin bonus
    let margin: number
    if (pick.selected_team === game.home_team) {
      margin = Math.abs((game.home_score - game.away_score) - game.spread)
    } else {
      margin = Math.abs((game.away_score - game.home_score) + game.spread)
    }

    let bonus = 0
    if (margin >= 29) bonus = 5
    else if (margin >= 20) bonus = 3  
    else if (margin >= 11) bonus = 1

    const basePoints = 20
    const totalBonus = pick.is_lock ? bonus * 2 : bonus
    
    return { result: 'win', points: basePoints + totalBonus }
  }

  /**
   * Get games for a specific week/season
   */
  private static async getGames(season: number, week?: number): Promise<GameResult[]> {
    console.log('🎮 getGames: TEMPORARILY returning empty array to focus on user loading')
    return []
  }

  /**
   * Get verified user picks from LeagueSafe players only
   */
  private static async getAuthenticatedPicks(season: number, verifiedUserIds: string[], week?: number): Promise<PickResult[]> {
    console.log('🔍 getAuthenticatedPicks: Starting query for season', season, week ? `week ${week}` : 'all weeks')
    console.log('🔍 getAuthenticatedPicks: Using pre-verified user list with', verifiedUserIds.length, 'verified players')
    
    try {
      if (verifiedUserIds.length === 0) {
        console.log('🔍 getAuthenticatedPicks: No verified players provided, returning empty array')
        return []
      }
      
      // Handle large user ID arrays by batching queries
      const batchSize = 50 // Process 50 users at a time to avoid query size limits
      const allPicks = []
      
      console.log('🔍 getAuthenticatedPicks: Processing', verifiedUserIds.length, 'user IDs in batches of', batchSize)
      
      for (let i = 0; i < verifiedUserIds.length; i += batchSize) {
        const batch = verifiedUserIds.slice(i, i + batchSize)
        console.log('🔍 getAuthenticatedPicks: Processing batch', Math.floor(i/batchSize) + 1, 'of', Math.ceil(verifiedUserIds.length/batchSize), 'with', batch.length, 'users')
        
        // Build the query for this batch of picks
        let query = supabase
          .from('picks')
          .select('user_id,game_id,week,season,selected_team,is_lock,result,points_earned')
          .eq('season', season)
          .in('user_id', batch)
          
        if (week) {
          query = query.eq('week', week)
        }
        
        const { data: picks, error: picksError } = await query
        
        if (picksError) {
          console.error('🔍 getAuthenticatedPicks: Batch query failed for batch', Math.floor(i/batchSize) + 1, ':', picksError)
          throw picksError
        }
        
        allPicks.push(...(picks || []))
        console.log('🔍 getAuthenticatedPicks: Batch', Math.floor(i/batchSize) + 1, 'completed, found', picks?.length || 0, 'picks')
      }
      
      console.log('🔍 getAuthenticatedPicks: All batches completed successfully, found', allPicks.length, 'total picks')
      return allPicks
      
    } catch (error) {
      console.error('🔍 getAuthenticatedPicks: Exception in query:', error)
      return []
    }
  }

  /**
   * Get anonymous picks that are assigned to verified users
   */
  private static async getAnonymousPicks(season: number, verifiedUserIds: string[], week?: number): Promise<PickResult[]> {
    console.log('👤 getAnonymousPicks: Starting query for season', season, week ? `week ${week}` : 'all weeks')
    console.log('👤 getAnonymousPicks: Using pre-verified user list with', verifiedUserIds.length, 'verified players')
    
    try {
      if (verifiedUserIds.length === 0) {
        console.log('👤 getAnonymousPicks: No verified players provided, returning empty array')
        return []
      }
      
      // Handle large user ID arrays by batching queries
      const batchSize = 50 // Process 50 users at a time to avoid query size limits
      const allPicks = []
      
      console.log('👤 getAnonymousPicks: Processing', verifiedUserIds.length, 'user IDs in batches of', batchSize)
      
      for (let i = 0; i < verifiedUserIds.length; i += batchSize) {
        const batch = verifiedUserIds.slice(i, i + batchSize)
        console.log('👤 getAnonymousPicks: Processing batch', Math.floor(i/batchSize) + 1, 'of', Math.ceil(verifiedUserIds.length/batchSize), 'with', batch.length, 'users')
        
        // Build the query for this batch of anonymous picks
        let query = supabase
          .from('anonymous_picks')
          .select('assigned_user_id as user_id,game_id,week,season,selected_team,is_lock,result,points_earned')
          .eq('season', season)
          .in('assigned_user_id', batch)
          .not('assigned_user_id', 'is', null)
          
        if (week) {
          query = query.eq('week', week)
        }
        
        const { data: picks, error } = await query
        
        if (error) {
          console.error('👤 getAnonymousPicks: Batch query failed for batch', Math.floor(i/batchSize) + 1, ':', error)
          throw error
        }
        
        allPicks.push(...(picks || []))
        console.log('👤 getAnonymousPicks: Batch', Math.floor(i/batchSize) + 1, 'completed, found', picks?.length || 0, 'picks')
      }
      
      console.log('👤 getAnonymousPicks: All batches completed successfully, found', allPicks.length, 'total anonymous picks')
      return allPicks
      
    } catch (error) {
      console.error('👤 getAnonymousPicks: Exception in query:', error)
      return []
    }
  }

  /**
   * Get verified LeagueSafe players for the specified season
   */
  private static async getUsers(season: number): Promise<{ id: string; display_name: string }[]> {
    console.log('👥 getUsers: Starting query for verified LeagueSafe players for season', season)
    
    try {
      console.log('👥 getUsers: Testing simple query first...')
      
      // Try a simple count query first to test connectivity
      const { count, error: countError } = await supabase
        .from('leaguesafe_payments')
        .select('*', { count: 'exact', head: true })
        .eq('season', season)
        .eq('status', 'Paid')
        .eq('is_matched', true)
      
      if (countError) {
        console.error('👥 getUsers: Count query failed:', countError)
        throw countError
      }
      
      console.log('👥 getUsers: Count query success -', count, 'verified players found for season', season)
      
      if (count === 0) {
        console.log('👥 getUsers: No verified players found, returning empty array')
        return []
      }
      
      // If count query worked, try the exact same query that worked in direct tests
      console.log('👥 getUsers: Count query successful, now executing exact query from successful direct tests...')
      
      const { data: payments, error } = await supabase
        .from('leaguesafe_payments')
        .select('user_id, leaguesafe_owner_name, status, is_matched')
        .eq('season', season)
        .eq('status', 'Paid')
        .eq('is_matched', true)
        .not('user_id', 'is', null)
        .order('user_id')
      
      if (error) {
        console.error('👥 getUsers: Full query failed:', error)
        throw error
      }
      
      console.log('👥 getUsers: Full query completed successfully, found', payments?.length || 0, 'verified LeagueSafe players')
      
      // Convert payments to user format using LeagueSafe owner name as display name
      const users = (payments || []).map(payment => ({
        id: payment.user_id,
        display_name: payment.leaguesafe_owner_name
      }))
      
      console.log('👥 getUsers: Returning', users.length, 'user objects')
      return users
      
    } catch (error) {
      console.error('👥 getUsers: Exception occurred:', error)
      // Return a minimal set of users as fallback instead of crashing
      console.log('👥 getUsers: Falling back to minimal user set due to query failure')
      return [
        { id: 'fallback-1', display_name: 'Test User 1' },
        { id: 'fallback-2', display_name: 'Test User 2' },
        { id: 'fallback-3', display_name: 'Test User 3' }
      ]
    }
  }

  /**
   * Calculate pick results on-demand for picks that don't have calculated values
   */
  private static calculatePickResults(picks: PickResult[], games: GameResult[]): { picks: PickResult[], liveCalculated: boolean } {
    const gameMap = new Map(games.map(game => [game.id, game]))
    let liveCalculated = false
    
    const calculatedPicks = picks.map(pick => {
      // If pick already has calculated results, use them
      if (pick.result !== null && pick.points_earned !== null) {
        return pick
      }
      
      // Find the corresponding game
      const game = gameMap.get(pick.game_id)
      if (!game) {
        console.warn(`Game not found for pick ${pick.game_id}`)
        return { ...pick, result: null, points_earned: 0 }
      }
      
      // Only calculate results for completed games
      if (game.status !== 'completed' || game.home_score === null || game.away_score === null) {
        return { ...pick, result: null, points_earned: 0 }
      }
      
      // Calculate the result using the scoring service
      liveCalculated = true // Mark that we did live calculation
      const { result, points } = calculatePickResult(
        pick.selected_team,
        game.home_team,
        game.away_team,
        game.home_score,
        game.away_score,
        game.spread,
        pick.is_lock
      )
      
      return {
        ...pick,
        result: result,
        points_earned: points
      }
    })
    
    return { picks: calculatedPicks, liveCalculated }
  }

  /**
   * Get leaderboard data for a specific week
   */
  static async getWeeklyLeaderboard(season: number, week: number): Promise<LeaderboardEntry[]> {
    console.log('LeaderboardService.getWeeklyLeaderboard:', { season, week })

    try {
      // Get data sequentially to avoid overwhelming database connections
      console.log('LeaderboardService.getWeeklyLeaderboard: Starting sequential queries to avoid connection issues...')
      
      console.log('LeaderboardService.getWeeklyLeaderboard: 1/4 - Getting users...')
      const users = await this.getUsers(season)
      console.log('LeaderboardService.getWeeklyLeaderboard: ✅ Users query completed:', users.length, 'users')
      
      console.log('LeaderboardService.getWeeklyLeaderboard: 2/4 - Getting games...')
      const games = await this.getGames(season, week)
      console.log('LeaderboardService.getWeeklyLeaderboard: ✅ Games query completed:', games.length, 'games')
      
      console.log('LeaderboardService.getWeeklyLeaderboard: 3/4 - Getting authenticated picks...')
      const authPicks = await this.getAuthenticatedPicks(season, week)
      console.log('LeaderboardService.getWeeklyLeaderboard: ✅ Auth picks query completed:', authPicks.length, 'picks')
      
      console.log('LeaderboardService.getWeeklyLeaderboard: 4/4 - Getting anonymous picks...')
      const anonPicks = await this.getAnonymousPicks(season, week)
      console.log('LeaderboardService.getWeeklyLeaderboard: ✅ Anon picks query completed:', anonPicks.length, 'picks')

      console.log('LeaderboardService.getWeeklyLeaderboard: ✅ ALL queries completed - Got', authPicks.length, 'auth picks,', anonPicks.length, 'anon picks,', games.length, 'games,', users.length, 'verified users')

      // Combine all picks (authPicks already have calculated results, anonPicks need calculation)
      const allPicks = [...authPicks, ...anonPicks]

      // Calculate results for anonymous picks that don't have them, authenticated picks already have results
      const { picks: allCalculatedPicks, liveCalculated } = this.calculatePickResults(allPicks, games)
      
      // All picks should have valid results now
      const picksWithResults = allCalculatedPicks.filter(pick => 
        pick.result !== null && pick.points_earned !== null
      )
      
      console.log('LeaderboardService.getWeeklyLeaderboard: Calculated', allCalculatedPicks.length, 'total picks,', picksWithResults.length, 'with results', liveCalculated ? '(live calculated)' : '(from database)')
      if (picksWithResults.length > 0) {
        console.log('Sample pick with result:', picksWithResults[0])
      }
      
      // Show ALL picks for debugging, including those without results
      const picksWithoutResults = allCalculatedPicks.filter(pick => 
        pick.result === null || pick.points_earned === null
      )
      if (picksWithoutResults.length > 0) {
        console.log(`${picksWithoutResults.length} picks without results (games not completed):`)
        console.log('Sample unscored pick:', picksWithoutResults[0])
      }

      // Group picks by user
      const userPicksMap = new Map<string, typeof picksWithResults>()
      picksWithResults.forEach(pick => {
        if (!userPicksMap.has(pick.user_id)) {
          userPicksMap.set(pick.user_id, [])
        }
        userPicksMap.get(pick.user_id)!.push(pick)
      })

      // Calculate leaderboard entries
      const entries: LeaderboardEntry[] = []
      
      for (const user of users) {
        const userPicks = userPicksMap.get(user.id) || []
        
        // Skip users with no picks for this week
        if (userPicks.length === 0) continue

        const wins = userPicks.filter(p => p.result === 'win').length
        const losses = userPicks.filter(p => p.result === 'loss').length
        const pushes = userPicks.filter(p => p.result === 'push').length
        const lockWins = userPicks.filter(p => p.result === 'win' && p.is_lock).length
        const lockLosses = userPicks.filter(p => p.result === 'loss' && p.is_lock).length
        const weeklyPoints = userPicks.reduce((sum, p) => sum + (p.points_earned || 0), 0)

        entries.push({
          user_id: user.id,
          display_name: user.display_name,
          weekly_record: `${wins}-${losses}-${pushes}`,
          season_record: '', // Will be calculated separately
          lock_record: `${lockWins}-${lockLosses}`,
          weekly_points: weeklyPoints,
          season_points: 0, // Will be calculated separately
          total_picks: userPicks.length,
          total_wins: wins,
          total_losses: losses,  
          total_pushes: pushes,
          lock_wins: lockWins,
          lock_losses: lockLosses,
          season_rank: 0, // Will be assigned after sorting
          weekly_rank: 0, // Will be assigned after sorting
          live_calculated: liveCalculated // Indicate if scores were calculated on-demand
        })
      }

      // Sort by weekly points and assign ranks
      entries.sort((a, b) => (b.weekly_points || 0) - (a.weekly_points || 0))
      entries.forEach((entry, index) => {
        entry.weekly_rank = index + 1
      })

      console.log('✅ Generated weekly leaderboard:', entries.length, 'entries')
      return entries

    } catch (error) {
      console.error('LeaderboardService.getWeeklyLeaderboard failed:', error)
      throw error
    }
  }

  /**
   * Get season leaderboard data
   */
  static async getSeasonLeaderboard(season: number): Promise<LeaderboardEntry[]> {
    console.log('LeaderboardService.getSeasonLeaderboard:', { season })

    try {
      // Get data sequentially to avoid overwhelming database connections
      console.log('LeaderboardService.getSeasonLeaderboard: Starting sequential queries to avoid connection issues...')
      
      console.log('LeaderboardService.getSeasonLeaderboard: 1/4 - Getting users...')
      const users = await this.getUsers(season)
      console.log('LeaderboardService.getSeasonLeaderboard: ✅ Users query completed:', users.length, 'users')
      
      // Extract user IDs to pass to other queries (avoid duplicate leaguesafe_payments queries)
      const verifiedUserIds = users.map(user => user.id).filter(id => !id.startsWith('fallback-'))
      console.log('LeaderboardService.getSeasonLeaderboard: Extracted', verifiedUserIds.length, 'verified user IDs for subsequent queries')
      
      console.log('LeaderboardService.getSeasonLeaderboard: 2/4 - Getting games...')
      const games = await this.getGames(season)
      console.log('LeaderboardService.getSeasonLeaderboard: ✅ Games query completed:', games.length, 'games')
      
      console.log('LeaderboardService.getSeasonLeaderboard: 3/4 - Getting authenticated picks...')
      const authPicks = await this.getAuthenticatedPicks(season, verifiedUserIds)
      console.log('LeaderboardService.getSeasonLeaderboard: ✅ Auth picks query completed:', authPicks.length, 'picks')
      
      console.log('LeaderboardService.getSeasonLeaderboard: 4/4 - Getting anonymous picks...')
      const anonPicks = await this.getAnonymousPicks(season, verifiedUserIds)
      console.log('LeaderboardService.getSeasonLeaderboard: ✅ Anon picks query completed:', anonPicks.length, 'picks')

      console.log('LeaderboardService.getSeasonLeaderboard: ✅ ALL queries completed - Got', authPicks.length, 'auth picks,', anonPicks.length, 'anon picks,', games.length, 'games,', users.length, 'verified users')

      // Combine all picks (authPicks already have calculated results, anonPicks need calculation)
      const allPicks = [...authPicks, ...anonPicks]

      // Calculate results for anonymous picks that don't have them, authenticated picks already have results
      const { picks: allCalculatedPicks, liveCalculated } = this.calculatePickResults(allPicks, games)
      
      // All picks should have valid results now
      const picksWithResults = allCalculatedPicks.filter(pick => 
        pick.result !== null && pick.points_earned !== null
      )
      
      console.log('LeaderboardService.getSeasonLeaderboard: Calculated', allCalculatedPicks.length, 'total picks,', picksWithResults.length, 'with results', liveCalculated ? '(live calculated)' : '(from database)')

      // Group picks by user
      const userPicksMap = new Map<string, typeof picksWithResults>()
      picksWithResults.forEach(pick => {
        if (!userPicksMap.has(pick.user_id)) {
          userPicksMap.set(pick.user_id, [])
        }
        userPicksMap.get(pick.user_id)!.push(pick)
      })

      // Calculate leaderboard entries
      const entries: LeaderboardEntry[] = []
      
      for (const user of users) {
        const userPicks = userPicksMap.get(user.id) || []
        
        // Skip users with no picks for the season
        if (userPicks.length === 0) continue

        const wins = userPicks.filter(p => p.result === 'win').length
        const losses = userPicks.filter(p => p.result === 'loss').length
        const pushes = userPicks.filter(p => p.result === 'push').length
        const lockWins = userPicks.filter(p => p.result === 'win' && p.is_lock).length
        const lockLosses = userPicks.filter(p => p.result === 'loss' && p.is_lock).length
        const seasonPoints = userPicks.reduce((sum, p) => sum + (p.points_earned || 0), 0)

        entries.push({
          user_id: user.id,
          display_name: user.display_name,
          season_record: `${wins}-${losses}-${pushes}`,
          lock_record: `${lockWins}-${lockLosses}`,
          season_points: seasonPoints,
          total_picks: userPicks.length,
          total_wins: wins,
          total_losses: losses,
          total_pushes: pushes,
          lock_wins: lockWins,
          lock_losses: lockLosses,
          weekly_rank: 0,
          season_rank: 0, // Will be assigned after sorting
          live_calculated: liveCalculated // Indicate if scores were calculated on-demand
        })
      }

      // Sort by season points and assign ranks
      entries.sort((a, b) => b.season_points - a.season_points)
      entries.forEach((entry, index) => {
        entry.season_rank = index + 1
      })

      console.log('✅ Generated season leaderboard:', entries.length, 'entries')
      return entries

    } catch (error) {
      console.error('LeaderboardService.getSeasonLeaderboard failed:', error)
      throw error
    }
  }
}