/**
 * Score Calculation Service
 * Handles pick result calculation and point assignment
 */

import { supabase } from '@/lib/supabase'

export interface PickResult {
  pick_id: string
  result: 'win' | 'loss' | 'push'
  points_earned: number
  bonus_points: number
}

export interface GameResult {
  game_id: string
  home_score: number
  away_score: number
  home_team: string
  away_team: string
  spread: number
  status: 'completed' | 'in_progress' | 'scheduled'
  // Live timing data from CFBD scoreboard API
  game_period?: number | null
  game_clock?: string | null
  api_period?: number | null
  api_clock?: string | null
  api_home_points?: number | null
  api_away_points?: number | null
  api_completed?: boolean | null
}

/**
 * Calculate pick result based on game outcome and spread
 */
export function calculatePickResult(
  selectedTeam: string,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  spread: number,
  isLock: boolean = false
): { result: 'win' | 'loss' | 'push'; points: number; bonusPoints: number } {
  
  // Determine if user picked home or away team
  const pickedHome = selectedTeam === homeTeam
  const actualMargin = homeScore - awayScore
  
  // Calculate spread result
  // Spread logic: if home team is favored, spread is negative (e.g., -6.5)
  // Home team must win by MORE than the spread to cover
  // Away team covers if they lose by LESS than the spread or win outright
  let result: 'win' | 'loss' | 'push'
  
  if (pickedHome) {
    // User picked home team - home team must cover the spread
    // For home favorite (negative spread): actualMargin must be greater than |spread|
    // For home underdog (positive spread): home team just needs to win or lose by less than spread
    if (actualMargin > Math.abs(spread)) {
      result = 'win' // Home team covered the spread
    } else if (actualMargin === Math.abs(spread)) {
      result = 'push' // Exactly hit the spread
    } else {
      result = 'loss' // Home team didn't cover
    }
  } else {
    // User picked away team - away team must cover the spread
    // For away favorite (home spread is positive): away must win by more than spread
    // For away underdog (home spread is negative): away covers if they lose by less than |spread| or win
    if (spread < 0) {
      // Home team is favored, away team is underdog
      // Away team covers if they lose by less than the spread or win outright
      if (actualMargin < Math.abs(spread)) {
        result = 'win' // Away team covered the spread
      } else if (actualMargin === Math.abs(spread)) {
        result = 'push' // Exactly hit the spread
      } else {
        result = 'loss' // Away team didn't cover
      }
    } else {
      // Away team is favored, home team is underdog
      // Away team must win by more than the spread
      if (Math.abs(actualMargin) > spread) {
        result = 'win' // Away team covered the spread
      } else if (Math.abs(actualMargin) === spread) {
        result = 'push' // Exactly hit the spread
      } else {
        result = 'loss' // Away team didn't cover
      }
    }
  }
  
  // Calculate base points
  let basePoints = 0
  if (result === 'win') {
    basePoints = 20
  } else if (result === 'push') {
    basePoints = 10
  } else {
    basePoints = 0
  }
  
  // Calculate bonus points for wins
  let bonusPoints = 0
  if (result === 'win') {
    // Calculate how much the team beat the spread by
    let coverMargin = 0
    if (pickedHome) {
      // Home team covered the spread
      // Cover margin = how much better they did than the spread required
      coverMargin = actualMargin - Math.abs(spread)
    } else {
      // Away team covered the spread
      if (spread < 0) {
        // Home team was favored, away team was underdog
        // Away team covers if they lose by less than |spread| or win
        // Cover margin = how much better they did than needed
        coverMargin = Math.abs(spread) - actualMargin
      } else {
        // Away team was favored, home team was underdog  
        // Away team needed to win by more than spread
        // Cover margin = how much they exceeded the required margin
        coverMargin = Math.abs(actualMargin) - spread
      }
    }
    
    if (coverMargin >= 29) {
      bonusPoints = 5 // Cover by 29+
    } else if (coverMargin >= 20) {
      bonusPoints = 3 // Cover by 20-28.5
    } else if (coverMargin >= 11) {
      bonusPoints = 1 // Cover by 11-19.5
    }
    // 0-10.5 margin gets no bonus
  }
  
  // Apply lock multiplier (doubles the bonus)
  if (isLock) {
    bonusPoints = bonusPoints * 2
  }
  
  const totalPoints = basePoints + bonusPoints
  
  const displayCoverMargin = result === 'win' ? 
    (pickedHome ? actualMargin - Math.abs(spread) : 
     spread < 0 ? Math.abs(spread) - actualMargin : Math.abs(actualMargin) - spread) : 0
  
  console.log(`Pick result: ${selectedTeam} | ${result} | ${totalPoints} pts (${basePoints} base + ${bonusPoints} bonus)${isLock ? ' [LOCK]' : ''} | Cover margin: ${displayCoverMargin}`)
  
  return {
    result,
    points: totalPoints,
    bonusPoints
  }
}

/**
 * Test scoring calculations with dummy data
 */
export function testScoringCalculations() {
  console.log('🧪 Testing scoring calculations...')
  
  // Scenario 1: Take KSU (-5) and they win 35-17 (18 point victory)
  // KSU covered by 13 points (18 - 5 = 13), should get 20 + 1 = 21 points
  const test1 = calculatePickResult(
    'KANSAS STATE', // selected team
    'KANSAS STATE', // home team  
    'TEXAS TECH', // away team
    35, // home score
    17, // away score
    -5, // spread (KSU favored by 5)
    false // not a lock
  )
  console.log('Test 1 (KSU scenario):', test1)
  
  // Scenario 2: Take Texas Tech as lock and they win 35-17 (18 point victory) 
  // Texas Tech got +5, so they covered by 23 points (18 + 5 = 23), should get 20 + 6 = 26 points (3 bonus * 2 for lock)
  const test2 = calculatePickResult(
    'TEXAS TECH', // selected team
    'KANSAS STATE', // home team
    'TEXAS TECH', // away team  
    17, // home score (switched scores from scenario)
    35, // away score
    -5, // spread (KSU still favored by 5, but TT is getting +5)
    true // lock
  )
  console.log('Test 2 (Texas Tech lock scenario):', test2)
  
  // Test 3: Bonus point boundaries
  console.log('\n🎯 Testing bonus point boundaries:')
  
  // Cover by exactly 11 - should get 1 bonus
  const test3a = calculatePickResult('HOME', 'HOME', 'AWAY', 21, 5, -5, false) // 16 - (-5) = 21, but actual margin is 16, cover by 16 - 5 = 11
  console.log('Cover by 11:', test3a)
  
  // Cover by exactly 20 - should get 3 bonus  
  const test3b = calculatePickResult('HOME', 'HOME', 'AWAY', 30, 5, -5, false) // 25 - (-5) = 30, but actual margin is 25, cover by 25 - 5 = 20
  console.log('Cover by 20:', test3b)
  
  // Cover by exactly 29 - should get 5 bonus
  const test3c = calculatePickResult('HOME', 'HOME', 'AWAY', 39, 5, -5, false) // 34 - (-5) = 39, but actual margin is 34, cover by 34 - 5 = 29  
  console.log('Cover by 29:', test3c)
  
  // Test 4: Nebraska vs Cincinnati scenario (the actual bug)
  console.log('\n🏈 Testing Nebraska vs Cincinnati ATS bug:')
  
  // Nebraska picks should LOSE ATS (Nebraska didn't cover 6.5 spread)
  const nebraskaPick = calculatePickResult(
    'NEBRASKA', // selected team
    'NEBRASKA', // home team
    'CINCINNATI', // away team
    20, // home score (Nebraska)
    17, // away score (Cincinnati)
    -6.5, // spread (Nebraska favored by 6.5)
    false // not a lock
  )
  console.log('Nebraska pick result (should be LOSS):', nebraskaPick)
  
  // Cincinnati picks should WIN ATS (Cincinnati covered as underdog)
  const cincinnatiPick = calculatePickResult(
    'CINCINNATI', // selected team
    'NEBRASKA', // home team
    'CINCINNATI', // away team
    20, // home score (Nebraska) 
    17, // away score (Cincinnati)
    -6.5, // spread (Nebraska favored by 6.5)
    false // not a lock
  )
  console.log('Cincinnati pick result (should be WIN):', cincinnatiPick)
}

/**
 * Update game scores in database
 */
export async function updateGameInDatabase(gameResult: GameResult): Promise<void> {
  try {
    // Build update object with live timing data if available
    const updateData: any = {
      home_score: gameResult.home_score,
      away_score: gameResult.away_score,
      status: gameResult.status,
      updated_at: new Date().toISOString()
    }

    // Add live timing data if provided
    if (gameResult.game_period !== undefined) updateData.game_period = gameResult.game_period
    if (gameResult.game_clock !== undefined) updateData.game_clock = gameResult.game_clock
    if (gameResult.api_period !== undefined) updateData.api_period = gameResult.api_period
    if (gameResult.api_clock !== undefined) updateData.api_clock = gameResult.api_clock
    if (gameResult.api_home_points !== undefined) updateData.api_home_points = gameResult.api_home_points
    if (gameResult.api_away_points !== undefined) updateData.api_away_points = gameResult.api_away_points
    if (gameResult.api_completed !== undefined) updateData.api_completed = gameResult.api_completed

    const { error } = await supabase
      .from('games')
      .update(updateData)
      .eq('id', gameResult.game_id)
    
    if (error) throw error
    
    const liveInfo = gameResult.game_period && gameResult.game_clock ? 
      ` (Q${gameResult.game_period} ${gameResult.game_clock})` : ''
    console.log(`✅ Updated game ${gameResult.game_id}: ${gameResult.away_team} ${gameResult.away_score} - ${gameResult.home_score} ${gameResult.home_team}${liveInfo}`)
  } catch (error) {
    console.error(`❌ Error updating game ${gameResult.game_id}:`, error)
    throw error
  }
}

/**
 * Calculate and update pick results for a completed game
 */
export async function calculatePicksForGame(gameId: string): Promise<PickResult[]> {
  try {
    console.log(`🎯 Calculating picks for game ${gameId}`)
    
    // Get game details
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single()
    
    if (gameError) throw gameError
    if (!game || game.home_score === null || game.away_score === null) {
      throw new Error('Game not found or scores not available')
    }
    
    // Get all picks for this game
    const { data: picks, error: picksError } = await supabase
      .from('picks')
      .select('*')
      .eq('game_id', gameId)
    
    if (picksError) throw picksError
    if (!picks || picks.length === 0) {
      console.log(`No picks found for game ${gameId}`)
      return []
    }
    
    const results: PickResult[] = []
    
    // Calculate result for each pick
    for (const pick of picks) {
      const { result, points, bonusPoints } = calculatePickResult(
        pick.selected_team,
        game.home_team,
        game.away_team,
        game.home_score,
        game.away_score,
        game.spread,
        pick.is_lock
      )
      
      // Update pick in database
      const { error: updateError } = await supabase
        .from('picks')
        .update({
          result,
          points_earned: points,
          updated_at: new Date().toISOString()
        })
        .eq('id', pick.id)
      
      if (updateError) {
        console.error(`❌ Error updating pick ${pick.id}:`, updateError)
        continue
      }
      
      results.push({
        pick_id: pick.id,
        result,
        points_earned: points,
        bonus_points: bonusPoints
      })
    }
    
    console.log(`✅ Updated ${results.length} picks for game ${gameId}`)
    return results
    
  } catch (error) {
    console.error(`❌ Error calculating picks for game ${gameId}:`, error)
    throw error
  }
}

/**
 * Process all completed games and update pick results
 */
export async function processCompletedGames(season: number, week: number): Promise<{
  gamesProcessed: number
  picksUpdated: number
  errors: string[]
}> {
  try {
    console.log(`🔄 Processing completed games for ${season} week ${week}`)
    
    // Get completed games from database that haven't been processed
    const { data: completedGames, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .eq('season', season)
      .eq('week', week)
      .eq('status', 'completed')
      .not('home_score', 'is', null)
      .not('away_score', 'is', null)
    
    if (gamesError) throw gamesError
    
    if (!completedGames || completedGames.length === 0) {
      console.log('No completed games to process')
      return { gamesProcessed: 0, picksUpdated: 0, errors: [] }
    }
    
    let totalPicksUpdated = 0
    const errors: string[] = []
    
    // Process each completed game
    for (const game of completedGames) {
      try {
        const pickResults = await calculatePicksForGame(game.id)
        totalPicksUpdated += pickResults.length
      } catch (error) {
        const errorMsg = `Failed to process game ${game.id}: ${error}`
        console.error(errorMsg)
        errors.push(errorMsg)
      }
    }
    
    console.log(`✅ Processed ${completedGames.length} games, updated ${totalPicksUpdated} picks`)
    
    return {
      gamesProcessed: completedGames.length,
      picksUpdated: totalPicksUpdated,
      errors
    }
    
  } catch (error) {
    console.error('❌ Error processing completed games:', error)
    throw error
  }
}