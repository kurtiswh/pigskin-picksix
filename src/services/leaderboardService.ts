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
    let query = supabase
      .from('games')
      .select('*')
      .eq('season', season)

    if (week !== undefined) {
      query = query.eq('week', week)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  }

  /**
   * Get authenticated user picks
   */
  private static async getAuthenticatedPicks(season: number, week?: number): Promise<PickResult[]> {
    let query = supabase
      .from('picks')
      .select(`
        user_id,
        game_id,
        week,
        season,
        selected_team,
        is_lock,
        result,
        points_earned
      `)
      .eq('season', season)

    if (week !== undefined) {
      query = query.eq('week', week)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  }

  /**
   * Get anonymous picks that are assigned to users
   */
  private static async getAnonymousPicks(season: number, week?: number): Promise<PickResult[]> {
    let query = supabase
      .from('anonymous_picks')
      .select(`
        assigned_user_id,
        game_id,
        week,
        season,
        selected_team,
        is_lock,
        show_on_leaderboard
      `)
      .eq('season', season)
      .not('assigned_user_id', 'is', null)
      .eq('show_on_leaderboard', true)

    if (week !== undefined) {
      query = query.eq('week', week)
    }

    const { data, error } = await query
    if (error) throw error

    // Convert anonymous picks to PickResult format
    return (data || []).map(pick => ({
      user_id: pick.assigned_user_id,
      game_id: pick.game_id,
      week: pick.week,
      season: pick.season,
      selected_team: pick.selected_team,
      is_lock: pick.is_lock,
      result: null, // Will be calculated
      points_earned: null // Will be calculated
    }))
  }

  /**
   * Get all users who have made picks
   */
  private static async getUsers(): Promise<{ id: string; display_name: string }[]> {
    const { data, error } = await supabase
      .from('users')
      .select('id, display_name')

    if (error) throw error
    return data || []
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
      // Get picks, games, and users in parallel - we need games for on-demand calculation
      const [authPicks, anonPicks, games, users] = await Promise.all([
        this.getAuthenticatedPicks(season, week),
        this.getAnonymousPicks(season, week),
        this.getGames(season, week),
        this.getUsers()
      ])

      console.log('LeaderboardService.getWeeklyLeaderboard: Got', authPicks.length, 'auth picks,', anonPicks.length, 'anon picks,', games.length, 'games,', users.length, 'users')

      // Combine all picks
      const allPicks = [...authPicks, ...anonPicks]

      // Calculate results for picks that don't have them, leave calculated ones as-is
      const { picks: allCalculatedPicks, liveCalculated } = this.calculatePickResults(allPicks, games)
      
      // Filter to picks that have valid results (either from DB or our calculation)
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
      // Get picks, games, and users for the season - we need games for on-demand calculation
      const [authPicks, anonPicks, games, users] = await Promise.all([
        this.getAuthenticatedPicks(season),
        this.getAnonymousPicks(season),
        this.getGames(season), // Get all games for the season
        this.getUsers()
      ])

      console.log('LeaderboardService.getSeasonLeaderboard: Got', authPicks.length, 'auth picks,', anonPicks.length, 'anon picks,', games.length, 'games,', users.length, 'users')

      // Combine all picks
      const allPicks = [...authPicks, ...anonPicks]

      // Calculate results for picks that don't have them, leave calculated ones as-is
      const { picks: allCalculatedPicks, liveCalculated } = this.calculatePickResults(allPicks, games)
      
      // Filter to picks that have valid results (either from DB or our calculation)
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