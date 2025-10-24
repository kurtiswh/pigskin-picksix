const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function diagnosePendingPicks() {
  console.log('🔍 Comprehensive Pending Picks Diagnostic\n')
  console.log('=' .repeat(70))
  
  try {
    // Step 1: Get Active Week
    console.log('\n1️⃣ ACTIVE WEEK DETECTION:')
    const { data: activeWeeks, error: weekError } = await supabase
      .from('week_settings')
      .select('week, season, picks_open')
      .eq('picks_open', true)
      .order('week', { ascending: false })
    
    if (weekError) throw new Error(`Week settings error: ${weekError.message}`)
    if (!activeWeeks || activeWeeks.length === 0) {
      throw new Error('No active week found (picks_open = true)')
    }
    
    const activeWeek = activeWeeks[0]
    console.log(`✅ Active Week: ${activeWeek.week} (Season ${activeWeek.season})`)
    
    // Step 2: Get All Games for Active Week
    console.log('\n2️⃣ GAMES ANALYSIS:')
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .eq('season', activeWeek.season)
      .eq('week', activeWeek.week)
      .order('kickoff_time')
    
    if (gamesError) throw new Error(`Games error: ${gamesError.message}`)
    if (!games || games.length === 0) {
      throw new Error('No games found for active week')
    }
    
    console.log(`Total games: ${games.length}`)
    
    // Categorize games by status
    const gamesByStatus = {
      scheduled: games.filter(g => g.status === 'scheduled'),
      in_progress: games.filter(g => g.status === 'in_progress'),
      completed: games.filter(g => g.status === 'completed')
    }
    
    console.log(`  📅 Scheduled: ${gamesByStatus.scheduled.length}`)
    console.log(`  🔴 In Progress: ${gamesByStatus.in_progress.length}`)
    console.log(`  ✅ Completed: ${gamesByStatus.completed.length}`)
    
    // Step 3: Analyze Picks by Game Status
    console.log('\n3️⃣ PICKS ANALYSIS BY GAME STATUS:')
    
    const gameIds = games.map(g => g.id)
    console.log(`Analyzing picks for ${gameIds.length} games...`)
    
    // Get ALL picks for the week (processed and unprocessed)
    const { data: allPicks, error: allPicksError } = await supabase
      .from('picks')
      .select('game_id, result, points_earned, selected_team, is_lock')
      .in('game_id', gameIds)
    
    const { data: allAnonPicks, error: allAnonPicksError } = await supabase
      .from('anonymous_picks')
      .select('game_id, result, points_earned, selected_team, is_lock')
      .in('game_id', gameIds)
    
    if (allPicksError) throw new Error(`All picks error: ${allPicksError.message}`)
    if (allAnonPicksError) throw new Error(`All anon picks error: ${allAnonPicksError.message}`)
    
    const totalPicks = (allPicks?.length || 0) + (allAnonPicks?.length || 0)
    console.log(`\n📊 TOTAL PICKS: ${totalPicks}`)
    console.log(`   Regular picks: ${allPicks?.length || 0}`)
    console.log(`   Anonymous picks: ${allAnonPicks?.length || 0}`)
    
    // Step 4: Detailed Breakdown by Game Status
    console.log('\n4️⃣ DETAILED BREAKDOWN BY GAME STATUS:')
    
    for (const [status, statusGames] of Object.entries(gamesByStatus)) {
      if (statusGames.length === 0) continue
      
      const statusGameIds = statusGames.map(g => g.id)
      
      // Get unprocessed picks for this status
      const { count: pendingPicks } = await supabase
        .from('picks')
        .select('*', { count: 'exact', head: true })
        .in('game_id', statusGameIds)
        .is('result', null)
      
      const { count: pendingAnonPicks } = await supabase
        .from('anonymous_picks')
        .select('*', { count: 'exact', head: true })
        .in('game_id', statusGameIds)
        .is('result', null)
      
      // Get processed picks for this status
      const { count: processedPicks } = await supabase
        .from('picks')
        .select('*', { count: 'exact', head: true })
        .in('game_id', statusGameIds)
        .not('result', 'is', null)
      
      const { count: processedAnonPicks } = await supabase
        .from('anonymous_picks')
        .select('*', { count: 'exact', head: true })
        .in('game_id', statusGameIds)
        .not('result', 'is', null)
      
      const totalPending = (pendingPicks || 0) + (pendingAnonPicks || 0)
      const totalProcessed = (processedPicks || 0) + (processedAnonPicks || 0)
      const totalForStatus = totalPending + totalProcessed
      
      console.log(`\n📋 ${status.toUpperCase()} GAMES (${statusGames.length} games):`)
      console.log(`   Total picks: ${totalForStatus}`)
      console.log(`   ✅ Processed: ${totalProcessed} (${processedPicks || 0} regular + ${processedAnonPicks || 0} anon)`)
      console.log(`   ⏳ Pending: ${totalPending} (${pendingPicks || 0} regular + ${pendingAnonPicks || 0} anon)`)
      
      // For completed games, pending picks are a PROBLEM
      if (status === 'completed' && totalPending > 0) {
        console.log(`   🚨 PROBLEM: ${totalPending} unprocessed picks for completed games!`)
        
        // Get details of problematic games
        console.log(`\n   🔍 PROBLEMATIC COMPLETED GAMES:`)
        for (const game of statusGames) {
          const { count: gamePendingPicks } = await supabase
            .from('picks')
            .select('*', { count: 'exact', head: true })
            .eq('game_id', game.id)
            .is('result', null)
          
          const { count: gamePendingAnon } = await supabase
            .from('anonymous_picks')
            .select('*', { count: 'exact', head: true })
            .eq('game_id', game.id)
            .is('result', null)
          
          const gameTotal = (gamePendingPicks || 0) + (gamePendingAnon || 0)
          
          if (gameTotal > 0) {
            console.log(`\n      🎮 ${game.away_team} @ ${game.home_team}`)
            console.log(`         Game ID: ${game.id}`)
            console.log(`         Score: ${game.away_score || '?'} - ${game.home_score || '?'}`)
            console.log(`         Status: ${game.status}`)
            console.log(`         Winner ATS: ${game.winner_against_spread || 'NOT SET'}`)
            console.log(`         Margin Bonus: ${game.margin_bonus || 'NOT SET'}`)
            console.log(`         Spread: ${game.spread || 'NOT SET'}`)
            console.log(`         Unprocessed picks: ${gameTotal} (${gamePendingPicks || 0} regular + ${gamePendingAnon || 0} anon)`)
            console.log(`         Last updated: ${game.updated_at}`)
            
            // Get sample of unprocessed picks
            if (gamePendingPicks > 0) {
              const { data: samplePicks } = await supabase
                .from('picks')
                .select('id, selected_team, is_lock, result, points_earned')
                .eq('game_id', game.id)
                .is('result', null)
                .limit(3)
              
              if (samplePicks && samplePicks.length > 0) {
                console.log(`         Sample unprocessed picks:`)
                samplePicks.forEach(p => {
                  console.log(`           - Pick ${p.id}: ${p.selected_team}${p.is_lock ? ' (LOCK)' : ''} -> result: ${p.result}, points: ${p.points_earned}`)
                })
              }
            }
          }
        }
      } else if (status === 'completed') {
        console.log(`   ✅ All picks properly processed for completed games`)
      } else {
        console.log(`   ℹ️ Pending picks are normal for ${status} games`)
      }
    }
    
    // Step 5: Root Cause Analysis for Completed Game Issues
    const completedGamesWithIssues = gamesByStatus.completed.filter(async (game) => {
      const { count: pendingCount } = await supabase
        .from('picks')
        .select('*', { count: 'exact', head: true })
        .eq('game_id', game.id)
        .is('result', null)
      return pendingCount > 0
    })
    
    if (gamesByStatus.completed.length > 0) {
      console.log('\n5️⃣ ROOT CAUSE ANALYSIS FOR COMPLETED GAMES:')
      
      // Check if scoring functions exist
      console.log(`\n🔧 Database Function Checks:`)
      
      const functionsToCheck = [
        'calculate_pick_results_for_game',
        'process_picks_for_completed_game',
        'calculate_winner_against_spread'
      ]
      
      for (const funcName of functionsToCheck) {
        try {
          const { data, error } = await supabase.rpc(funcName, { game_id_param: 'test' })
          if (error && error.message.includes('does not exist')) {
            console.log(`   ❌ Function '${funcName}' does not exist`)
          } else {
            console.log(`   ✅ Function '${funcName}' exists`)
          }
        } catch (e) {
          console.log(`   ⚠️ Function '${funcName}' check failed: ${e.message}`)
        }
      }
      
      // Check for games without winner calculation
      const gamesWithoutWinner = gamesByStatus.completed.filter(g => !g.winner_against_spread)
      if (gamesWithoutWinner.length > 0) {
        console.log(`\n🚨 ${gamesWithoutWinner.length} completed games missing winner_against_spread:`)
        gamesWithoutWinner.forEach(g => {
          console.log(`   - ${g.away_team} @ ${g.home_team}: ${g.away_score}-${g.home_score}`)
        })
      }
      
      // Check for games without scores
      const gamesWithoutScores = gamesByStatus.completed.filter(g => g.home_score === null || g.away_score === null)
      if (gamesWithoutScores.length > 0) {
        console.log(`\n🚨 ${gamesWithoutScores.length} completed games missing scores:`)
        gamesWithoutScores.forEach(g => {
          console.log(`   - ${g.away_team} @ ${g.home_team}: status=${g.status}, scores=${g.away_score}-${g.home_score}`)
        })
      }
    }
    
    // Step 6: Summary and Recommendations
    console.log('\n6️⃣ SUMMARY AND RECOMMENDATIONS:')
    console.log('=' .repeat(50))
    
    const totalPendingPicks = await supabase
      .from('picks')
      .select('*', { count: 'exact', head: true })
      .in('game_id', gameIds)
      .is('result', null)
    
    const totalPendingAnon = await supabase
      .from('anonymous_picks')
      .select('*', { count: 'exact', head: true })
      .in('game_id', gameIds)
      .is('result', null)
    
    const grandTotalPending = (totalPendingPicks.count || 0) + (totalPendingAnon.count || 0)
    
    console.log(`\n📊 FINAL NUMBERS:`)
    console.log(`   Total pending picks: ${grandTotalPending}`)
    console.log(`   - Regular picks: ${totalPendingPicks.count || 0}`)
    console.log(`   - Anonymous picks: ${totalPendingAnon.count || 0}`)
    
    const legitimatePending = (gamesByStatus.scheduled.length + gamesByStatus.in_progress.length) * 50 // Estimate picks per game
    const problematicPending = Math.max(0, grandTotalPending - legitimatePending)
    
    console.log(`\n🎯 ANALYSIS:`)
    if (gamesByStatus.completed.length > 0 && grandTotalPending > 0) {
      console.log(`   ⚠️ You have ${grandTotalPending} pending picks showing in admin`)
      console.log(`   📋 This likely includes:`)
      console.log(`      - Legitimate pending (scheduled/in-progress): ~${legitimatePending}`)
      console.log(`      - Problematic pending (completed games): ~${problematicPending}`)
      
      console.log(`\n💡 RECOMMENDED ACTIONS:`)
      if (problematicPending > 0) {
        console.log(`   1. Run "Update Picks Scoring" from admin to process completed games`)
        console.log(`   2. Check if database triggers are working properly`)
        console.log(`   3. Verify recent migrations (109/110) were applied correctly`)
      } else {
        console.log(`   1. The pending picks are mostly legitimate (scheduled/in-progress games)`)
        console.log(`   2. Consider updating the admin UI to separate legitimate vs problematic pending`)
      }
    } else {
      console.log(`   ✅ Pending picks numbers appear normal`)
      console.log(`   ℹ️ Most/all pending picks are for scheduled or in-progress games`)
    }
    
    console.log('\n' + '='.repeat(70))
    console.log('✅ Diagnostic complete!')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

// Run the diagnostic
diagnosePendingPicks().then(() => {
  console.log('\n✅ Script completed')
  process.exit(0)
}).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})