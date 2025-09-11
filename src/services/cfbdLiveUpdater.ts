/**
 * CFBD Live Updater Service
 * Fetches real-time game data from CFBD API and updates database
 */

import { supabase } from '@/lib/supabase'
import { ENV } from '@/lib/env'

interface CFBDScoreboardGame {
  id: number
  status: string
  period?: number
  clock?: string
  completed?: boolean
  homeTeam: {
    name: string
    points?: number
  }
  awayTeam: {
    name: string
    points?: number
  }
  betting?: {
    spread?: number
  }
}

interface LiveUpdateResult {
  success: boolean
  gamesChecked: number
  gamesUpdated: number
  newlyCompleted: number
  errors: string[]
}

export class CFBDLiveUpdater {
  
  /**
   * Main function to fetch CFBD data and update database games
   */
  static async updateLiveGames(): Promise<LiveUpdateResult> {
    console.log('🏈 CFBD Live Updater: Starting real-time update...')
    
    let gamesChecked = 0
    let gamesUpdated = 0
    let newlyCompleted = 0
    const errors: string[] = []
    
    try {
      // Step 1: Get active week
      const { data: activeWeeks, error: weekError } = await supabase
        .from('week_settings')
        .select('week, season')
        .eq('picks_open', true)
        .order('week', { ascending: false })
        .limit(1)
      
      if (weekError) throw new Error(`Week query failed: ${weekError.message}`)
      if (!activeWeeks || activeWeeks.length === 0) {
        return { success: true, gamesChecked: 0, gamesUpdated: 0, newlyCompleted: 0, errors: ['No active week found'] }
      }
      
      const activeWeek = activeWeeks[0]
      console.log(`🎯 Processing Week ${activeWeek.week} Season ${activeWeek.season}`)
      
      // Step 2: Get database games for active week
      // IMPORTANT: Also fetch completed games without winners (they may have been marked complete by time without scores)
      const { data: dbGames, error: dbError } = await supabase
        .from('games')
        .select('id, home_team, away_team, home_score, away_score, status, spread, kickoff_time, winner_against_spread, margin_bonus, game_period, game_clock')
        .eq('season', activeWeek.season)
        .eq('week', activeWeek.week)
        .or('status.neq.completed,winner_against_spread.is.null') // Get non-completed OR completed without winner
      
      if (dbError) throw new Error(`Database games query failed: ${dbError.message}`)
      if (!dbGames || dbGames.length === 0) {
        return { success: true, gamesChecked: 0, gamesUpdated: 0, newlyCompleted: 0, errors: [] }
      }
      
      console.log(`📊 Found ${dbGames.length} database games to check (including completed without scores)`)
      
      // Step 3: Fetch CFBD scoreboard data
      console.log('📡 Fetching CFBD scoreboard data...')
      const cfbdGames = await this.fetchCFBDScoreboard(activeWeek.season, activeWeek.week)
      console.log(`📡 CFBD returned ${cfbdGames.length} games`)
      
      // Step 4: Match and update games
      gamesChecked = dbGames.length
      
      for (const dbGame of dbGames) {
        try {
          console.log(`\n🔍 Processing: ${dbGame.away_team} @ ${dbGame.home_team}`)
          
          // Find matching CFBD game
          const cfbdGame = this.findMatchingCFBDGame(dbGame, cfbdGames)
          if (!cfbdGame) {
            console.log(`   ❌ No CFBD match found`)
            continue
          }
          
          console.log(`   ✅ CFBD match: ${cfbdGame.awayTeam.name} @ ${cfbdGame.homeTeam.name}`)
          console.log(`   📊 CFBD: ${cfbdGame.status}, ${cfbdGame.awayTeam.points || 0}-${cfbdGame.homeTeam.points || 0}`)
          console.log(`   📊 DB: ${dbGame.status}, ${dbGame.away_score || 0}-${dbGame.home_score || 0}`)
          
          // Check if update is needed
          const updateData = this.calculateUpdateData(dbGame, cfbdGame)
          if (!updateData) {
            console.log(`   ⏭️ No updates needed`)
            continue
          }
          
          console.log(`   🔄 Updating game...`)
          console.log(`   📝 Updates:`, updateData)
          
          // Update database
          const { error: updateError } = await supabase
            .from('games')
            .update(updateData)
            .eq('id', dbGame.id)
          
          if (updateError) {
            errors.push(`Failed to update ${dbGame.home_team}: ${updateError.message}`)
            console.log(`   ❌ Update failed: ${updateError.message}`)
            continue
          }
          
          gamesUpdated++
          console.log(`   ✅ Game updated successfully`)
          
          // Check if newly completed
          if (updateData.status === 'completed' && dbGame.status !== 'completed') {
            newlyCompleted++
            console.log(`   🎉 Game newly completed!`)
          }
          
          // Process picks if we just set a winner for a completed game
          if (updateData.winner_against_spread && updateData.status === 'completed') {
            console.log(`   🎯 Processing picks for newly completed game with winner...`)
            try {
              const { data: pickData, error: pickError } = await supabase
                .rpc('process_picks_for_completed_game', {
                  game_id_param: dbGame.id
                })
              
              if (pickError) {
                errors.push(`Pick processing failed for ${dbGame.home_team}: ${pickError.message}`)
                console.log(`   ⚠️ Pick processing failed: ${pickError.message}`)
              } else if (pickData && pickData.length > 0) {
                const { picks_updated, anonymous_picks_updated } = pickData[0]
                console.log(`   ✅ Picks processed: ${picks_updated} picks, ${anonymous_picks_updated} anonymous picks`)
              }
            } catch (pickProcessError: any) {
              errors.push(`Pick processing error for ${dbGame.home_team}: ${pickProcessError.message}`)
              console.log(`   ❌ Pick processing error: ${pickProcessError.message}`)
            }
          }
          
        } catch (gameError: any) {
          errors.push(`Error processing ${dbGame.home_team}: ${gameError.message}`)
          console.log(`   ❌ Game processing error: ${gameError.message}`)
        }
      }
      
      console.log(`\n📊 CFBD Live Update Results:`)
      console.log(`   Games checked: ${gamesChecked}`)
      console.log(`   Games updated: ${gamesUpdated}`)
      console.log(`   Newly completed: ${newlyCompleted}`)
      console.log(`   Errors: ${errors.length}`)
      
      return {
        success: errors.length === 0,
        gamesChecked,
        gamesUpdated,
        newlyCompleted,
        errors
      }
      
    } catch (error: any) {
      console.error('❌ CFBD Live Updater failed:', error.message)
      return {
        success: false,
        gamesChecked,
        gamesUpdated,
        newlyCompleted,
        errors: [error.message]
      }
    }
  }
  
  /**
   * Fetch CFBD scoreboard data
   */
  private static async fetchCFBDScoreboard(season: number, week: number): Promise<CFBDScoreboardGame[]> {
    try {
      const response = await fetch(
        `https://api.collegefootballdata.com/scoreboard?year=${season}&week=${week}&classification=fbs`,
        {
          headers: {
            'Authorization': `Bearer ${ENV.CFBD_API_KEY}`
          }
        }
      )
      
      if (!response.ok) {
        throw new Error(`CFBD API error: ${response.status} - ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error: any) {
      console.error('❌ CFBD API fetch failed:', error.message)
      throw error
    }
  }
  
  /**
   * Find matching CFBD game for database game
   */
  private static findMatchingCFBDGame(dbGame: any, cfbdGames: CFBDScoreboardGame[]): CFBDScoreboardGame | null {
    return cfbdGames.find(cfbdGame => {
      // Multiple matching strategies
      const dbHome = this.normalizeTeamName(dbGame.home_team)
      const dbAway = this.normalizeTeamName(dbGame.away_team)
      const cfbdHome = this.normalizeTeamName(cfbdGame.homeTeam.name)
      const cfbdAway = this.normalizeTeamName(cfbdGame.awayTeam.name)
      
      // Exact match
      if (dbHome === cfbdHome && dbAway === cfbdAway) {
        return true
      }
      
      // Partial match (one team name contains the other)
      const homeMatch = dbHome.includes(cfbdHome.substring(0, 5)) || 
                       cfbdHome.includes(dbHome.substring(0, 5))
      const awayMatch = dbAway.includes(cfbdAway.substring(0, 5)) || 
                       cfbdAway.includes(dbAway.substring(0, 5))
      
      return homeMatch && awayMatch
    }) || null
  }
  
  /**
   * Normalize team name for matching
   */
  private static normalizeTeamName(name: string): string {
    return name.toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
  }
  
  /**
   * Calculate what data needs to be updated
   */
  private static calculateUpdateData(dbGame: any, cfbdGame: CFBDScoreboardGame): any | null {
    const updates: any = {}
    let hasUpdates = false
    
    // Status updates
    let newStatus = dbGame.status
    
    // Debug logging for status determination
    console.log(`🔍 CFBD Status Analysis for ${dbGame.home_team}:`, {
      cfbdStatus: cfbdGame.status,
      cfbdCompleted: cfbdGame.completed,
      dbStatus: dbGame.status,
      cfbdHomeScore: cfbdGame.homeTeam.points,
      cfbdAwayScore: cfbdGame.awayTeam.points
    })
    
    // Score updates - Get actual scores from CFBD
    const cfbdHomeScore = cfbdGame.homeTeam.points
    const cfbdAwayScore = cfbdGame.awayTeam.points
    
    // CRITICAL: Only mark as completed if we have actual scores!
    if (cfbdGame.status === 'completed' || cfbdGame.completed) {
      if (cfbdHomeScore !== null && cfbdHomeScore !== undefined && 
          cfbdAwayScore !== null && cfbdAwayScore !== undefined) {
        console.log(`✅ CFBD marking ${dbGame.home_team} as COMPLETED with scores: ${cfbdAwayScore}-${cfbdHomeScore}`)
        newStatus = 'completed'
      } else {
        console.log(`⚠️ CFBD says ${dbGame.home_team} is completed but NO SCORES available`)
        console.log(`   Keeping status as: ${dbGame.status}`)
        newStatus = dbGame.status // Keep current status
      }
    } else if (cfbdGame.status === 'in_progress') {
      newStatus = 'in_progress'
    } else if (cfbdGame.status === 'scheduled') {
      newStatus = 'scheduled'
    }
    
    if (newStatus !== dbGame.status) {
      updates.status = newStatus
      hasUpdates = true
    }
    
    // Only update scores if we have actual values from CFBD
    if (cfbdHomeScore !== null && cfbdHomeScore !== undefined && 
        cfbdHomeScore !== dbGame.home_score) {
      updates.home_score = cfbdHomeScore
      hasUpdates = true
    }
    
    if (cfbdAwayScore !== null && cfbdAwayScore !== undefined && 
        cfbdAwayScore !== dbGame.away_score) {
      updates.away_score = cfbdAwayScore
      hasUpdates = true
    }
    
    // Timing updates
    if (cfbdGame.period && cfbdGame.period !== dbGame.game_period) {
      updates.game_period = cfbdGame.period
      hasUpdates = true
    }
    
    if (cfbdGame.clock && cfbdGame.clock !== dbGame.game_clock) {
      updates.game_clock = cfbdGame.clock
      hasUpdates = true
    }
    
    // 🚨 RACE CONDITION PREVENTION: Check if winner already exists
    if (dbGame.winner_against_spread) {
      console.log(`⚠️ CONFLICT DETECTED: ${dbGame.home_team} already has winner: ${dbGame.winner_against_spread}`)
      console.log(`   🔍 This suggests competing calculation paths are still active!`)
    }

    // Winner calculation ONLY for games that are definitively completed by CFBD with valid scores
    // Only calculate winner if:
    // 1. CFBD explicitly says the game is completed
    // 2. We don't already have a winner calculated (to prevent race conditions)
    // 3. We have actual scores from CFBD (not null/undefined)
    if ((cfbdGame.status === 'completed' || cfbdGame.completed === true) &&
        !dbGame.winner_against_spread && 
        cfbdHomeScore !== null && cfbdHomeScore !== undefined &&
        cfbdAwayScore !== null && cfbdAwayScore !== undefined) {
      console.log(`🎯 SINGLE SOURCE WINNER CALCULATION for ${dbGame.home_team}:`, {
        cfbdStatus: cfbdGame.status,
        cfbdCompleted: cfbdGame.completed,
        currentWinner: dbGame.winner_against_spread,
        cfbdHomeScore,
        cfbdAwayScore,
        combinedScore: cfbdHomeScore + cfbdAwayScore,
        spread: dbGame.spread,
        timestamp: new Date().toISOString()
      })
      
      const winnerData = this.calculateWinner(dbGame.home_team, dbGame.away_team, cfbdHomeScore, cfbdAwayScore, dbGame.spread || 0)
      updates.winner_against_spread = winnerData.winner
      updates.margin_bonus = winnerData.marginBonus
      updates.base_points = 20
      hasUpdates = true
      
      console.log(`✅ AUTHORITATIVE WINNER SET: ${winnerData.winner}, Margin: ${winnerData.marginBonus}, Base: 20`)
      
      // Log detailed calculation for push detection
      if (winnerData.winner === 'push') {
        console.log(`🟡 PUSH DETECTED: ${dbGame.away_team} @ ${dbGame.home_team}`)
        console.log(`   Final: ${cfbdAwayScore}-${cfbdHomeScore}, Spread: ${dbGame.spread}`)
        console.log(`   Margin: ${cfbdHomeScore - cfbdAwayScore}, Adjusted: ${(cfbdHomeScore - cfbdAwayScore) + (dbGame.spread || 0)}`)
      }
    } else if ((cfbdGame.status === 'completed' || cfbdGame.completed === true) &&
               dbGame.winner_against_spread) {
      console.log(`⏭️ WINNER ALREADY SET: ${dbGame.home_team} winner = ${dbGame.winner_against_spread}`)
      console.log(`   📊 Not recalculating to maintain consistency`)
    }
    
    if (hasUpdates) {
      updates.updated_at = new Date().toISOString()
      return updates
    }
    
    return null
  }
  
  /**
   * Calculate winner against spread and margin bonus
   */
  private static calculateWinner(homeTeam: string, awayTeam: string, homeScore: number, awayScore: number, spread: number) {
    const homeMargin = homeScore - awayScore
    
    let winner: string
    let marginBonus = 0
    
    if (Math.abs(homeMargin + spread) < 0.5) {
      winner = 'push'
    } else if (homeMargin + spread > 0) {
      winner = homeTeam
      // Calculate margin bonus for home team win
      if ((homeMargin + spread) >= 29) marginBonus = 5
      else if ((homeMargin + spread) >= 20) marginBonus = 3
      else if ((homeMargin + spread) >= 11) marginBonus = 1
    } else {
      winner = awayTeam
      // Calculate margin bonus for away team win
      if (Math.abs(homeMargin + spread) >= 29) marginBonus = 5
      else if (Math.abs(homeMargin + spread) >= 20) marginBonus = 3
      else if (Math.abs(homeMargin + spread) >= 11) marginBonus = 1
    }
    
    return { winner, marginBonus }
  }
}