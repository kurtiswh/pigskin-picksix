import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🏈 Live score updater cron job started')

    // Get environment variables
    const cfbdApiKey = Deno.env.get('CFBD_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!cfbdApiKey) {
      throw new Error('CFBD_API_KEY environment variable not set')
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let gamesChecked = 0
    let gamesUpdated = 0
    let newlyCompleted = 0
    const errors: string[] = []

    // Step 1: Get active week
    const { data: activeWeeks, error: weekError } = await supabase
      .from('week_settings')
      .select('week, season')
      .eq('picks_open', true)
      .order('week', { ascending: false })
      .limit(1)

    if (weekError) {
      throw new Error(`Week query failed: ${weekError.message}`)
    }

    if (!activeWeeks || activeWeeks.length === 0) {
      console.log('⏳ No active week found')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No active week found',
          gamesChecked: 0,
          gamesUpdated: 0,
          newlyCompleted: 0,
          errors: []
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const activeWeek = activeWeeks[0]
    console.log(`🎯 Processing Week ${activeWeek.week} Season ${activeWeek.season}`)

    // Step 2: Get database games for active week
    const { data: dbGames, error: dbError } = await supabase
      .from('games')
      .select('id, home_team, away_team, home_score, away_score, status, spread, kickoff_time, winner_against_spread, margin_bonus, game_period, game_clock')
      .eq('season', activeWeek.season)
      .eq('week', activeWeek.week)
      .or('status.neq.completed,winner_against_spread.is.null')

    if (dbError) {
      throw new Error(`Database games query failed: ${dbError.message}`)
    }

    if (!dbGames || dbGames.length === 0) {
      console.log('✅ No games need updating')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No games need updating',
          gamesChecked: 0,
          gamesUpdated: 0,
          newlyCompleted: 0,
          errors: []
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log(`📊 Found ${dbGames.length} database games to check`)

    // Step 3: Fetch CFBD scoreboard data
    console.log('📡 Fetching CFBD scoreboard data...')
    const cfbdResponse = await fetch(
      `https://api.collegefootballdata.com/scoreboard?year=${activeWeek.season}&week=${activeWeek.week}&classification=fbs`,
      {
        headers: {
          'Authorization': `Bearer ${cfbdApiKey}`
        }
      }
    )

    if (!cfbdResponse.ok) {
      throw new Error(`CFBD API error: ${cfbdResponse.status} - ${cfbdResponse.statusText}`)
    }

    const cfbdGames: CFBDScoreboardGame[] = await cfbdResponse.json()
    console.log(`📡 CFBD returned ${cfbdGames.length} games`)

    // Step 4: Match and update games
    gamesChecked = dbGames.length

    for (const dbGame of dbGames) {
      try {
        console.log(`\n🔍 Processing: ${dbGame.away_team} @ ${dbGame.home_team}`)

        // Find matching CFBD game
        const cfbdGame = findMatchingCFBDGame(dbGame, cfbdGames)
        if (!cfbdGame) {
          console.log(`   ❌ No CFBD match found`)
          continue
        }

        console.log(`   ✅ CFBD match: ${cfbdGame.awayTeam.name} @ ${cfbdGame.homeTeam.name}`)
        console.log(`   📊 CFBD: ${cfbdGame.status}, ${cfbdGame.awayTeam.points || 0}-${cfbdGame.homeTeam.points || 0}`)
        console.log(`   📊 DB: ${dbGame.status}, ${dbGame.away_score || 0}-${dbGame.home_score || 0}`)

        // Check if update is needed
        const updateData = calculateUpdateData(dbGame, cfbdGame)
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

    console.log(`\n📊 Live Update Results:`)
    console.log(`   Games checked: ${gamesChecked}`)
    console.log(`   Games updated: ${gamesUpdated}`)
    console.log(`   Newly completed: ${newlyCompleted}`)
    console.log(`   Errors: ${errors.length}`)

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        message: `Live update complete: ${gamesUpdated} games updated, ${newlyCompleted} newly completed`,
        gamesChecked,
        gamesUpdated,
        newlyCompleted,
        errors,
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('❌ Live score updater error:', error)

    return new Response(
      JSON.stringify({
        error: 'Live score update failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

/**
 * Find matching CFBD game for database game
 */
function findMatchingCFBDGame(dbGame: any, cfbdGames: CFBDScoreboardGame[]): CFBDScoreboardGame | null {
  return cfbdGames.find(cfbdGame => {
    const dbHome = normalizeTeamName(dbGame.home_team)
    const dbAway = normalizeTeamName(dbGame.away_team)
    const cfbdHome = normalizeTeamName(cfbdGame.homeTeam.name)
    const cfbdAway = normalizeTeamName(cfbdGame.awayTeam.name)

    // Exact match
    if (dbHome === cfbdHome && dbAway === cfbdAway) {
      return true
    }

    // Partial match
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
function normalizeTeamName(name: string): string {
  return name.toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

/**
 * Calculate what data needs to be updated
 */
function calculateUpdateData(dbGame: any, cfbdGame: CFBDScoreboardGame): any | null {
  const updates: any = {}
  let hasUpdates = false

  // Status updates
  let newStatus = dbGame.status

  const cfbdHomeScore = cfbdGame.homeTeam.points
  const cfbdAwayScore = cfbdGame.awayTeam.points

  // Only mark as completed if we have actual scores
  if (cfbdGame.status === 'completed' || cfbdGame.completed) {
    if (cfbdHomeScore !== null && cfbdHomeScore !== undefined &&
        cfbdAwayScore !== null && cfbdAwayScore !== undefined) {
      console.log(`✅ CFBD marking ${dbGame.home_team} as COMPLETED with scores: ${cfbdAwayScore}-${cfbdHomeScore}`)
      newStatus = 'completed'
    } else {
      console.log(`⚠️ CFBD says ${dbGame.home_team} is completed but NO SCORES available`)
      newStatus = dbGame.status
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

  // Score updates
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

  // Winner calculation - only for completed games without a winner
  if ((cfbdGame.status === 'completed' || cfbdGame.completed === true) &&
      !dbGame.winner_against_spread &&
      cfbdHomeScore !== null && cfbdHomeScore !== undefined &&
      cfbdAwayScore !== null && cfbdAwayScore !== undefined) {

    const winnerData = calculateWinner(dbGame.home_team, dbGame.away_team, cfbdHomeScore, cfbdAwayScore, dbGame.spread || 0)
    updates.winner_against_spread = winnerData.winner
    updates.margin_bonus = winnerData.marginBonus
    updates.base_points = 20
    hasUpdates = true

    console.log(`✅ WINNER SET: ${winnerData.winner}, Margin Bonus: ${winnerData.marginBonus}`)
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
function calculateWinner(homeTeam: string, awayTeam: string, homeScore: number, awayScore: number, spread: number) {
  const homeMargin = homeScore - awayScore

  let winner: string
  let marginBonus = 0

  if (Math.abs(homeMargin + spread) < 0.5) {
    winner = 'push'
  } else if (homeMargin + spread > 0) {
    winner = homeTeam
    if ((homeMargin + spread) >= 29) marginBonus = 5
    else if ((homeMargin + spread) >= 20) marginBonus = 3
    else if ((homeMargin + spread) >= 11) marginBonus = 1
  } else {
    winner = awayTeam
    if (Math.abs(homeMargin + spread) >= 29) marginBonus = 5
    else if (Math.abs(homeMargin + spread) >= 20) marginBonus = 3
    else if (Math.abs(homeMargin + spread) >= 11) marginBonus = 1
  }

  return { winner, marginBonus }
}
