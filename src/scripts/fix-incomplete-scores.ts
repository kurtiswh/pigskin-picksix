/**
 * Fix Games Marked Complete Without Proper Scores
 * Run this in the browser console from Admin Dashboard
 */

import { supabase } from '@/lib/supabase'

async function fixIncompleteScores() {
  console.log('🔧 FIXING GAMES MARKED COMPLETE WITHOUT SCORES')
  console.log('=============================================\n')
  
  try {
    // Step 1: Find problematic games
    console.log('🔍 Finding games with issues...')
    
    const { data: problematicGames, error: findError } = await supabase
      .from('games')
      .select('*')
      .eq('status', 'completed')
      .or('home_score.eq.0,away_score.eq.0,home_score.is.null,away_score.is.null,and(winner_against_spread.is.null,home_score.not.is.null)')
      
    if (findError) throw findError
    
    if (!problematicGames || problematicGames.length === 0) {
      console.log('✅ No problematic games found!')
      return
    }
    
    console.log(`❌ Found ${problematicGames.length} games with issues:\n`)
    
    // Group games by issue type
    const noScores = problematicGames.filter(g => g.home_score === null || g.away_score === null)
    const zeroScores = problematicGames.filter(g => g.home_score === 0 && g.away_score === 0)
    const noWinner = problematicGames.filter(g => 
      g.winner_against_spread === null && 
      g.home_score !== null && 
      g.away_score !== null &&
      !(g.home_score === 0 && g.away_score === 0)
    )
    
    if (noScores.length > 0) {
      console.log(`📊 Games marked complete WITHOUT scores (${noScores.length}):`)
      noScores.forEach(g => {
        console.log(`   • Week ${g.week}: ${g.away_team} @ ${g.home_team}`)
      })
    }
    
    if (zeroScores.length > 0) {
      console.log(`\n🚨 Games marked complete with 0-0 scores (${zeroScores.length}):`)
      zeroScores.forEach(g => {
        console.log(`   • Week ${g.week}: ${g.away_team} @ ${g.home_team}`)
      })
    }
    
    if (noWinner.length > 0) {
      console.log(`\n⚠️ Games completed but missing winner calculation (${noWinner.length}):`)
      noWinner.forEach(g => {
        console.log(`   • Week ${g.week}: ${g.away_team} @ ${g.home_team} (${g.away_score}-${g.home_score})`)
      })
    }
    
    // Step 2: Ask for confirmation
    const confirmed = window.confirm(`\nFound ${problematicGames.length} games to fix:\n` +
      `- ${noScores.length} without scores\n` +
      `- ${zeroScores.length} with 0-0 scores\n` +
      `- ${noWinner.length} missing winner calculation\n\n` +
      `Reset these to 'in_progress' so CFBD can update them properly?`)
    
    if (!confirmed) {
      console.log('❌ Fix cancelled by user')
      return
    }
    
    // Step 3: Fix games without scores or with 0-0 scores
    console.log('\n🔧 Fixing games...')
    
    const gamesNeedingScores = [...noScores, ...zeroScores]
    if (gamesNeedingScores.length > 0) {
      console.log(`\n📝 Resetting ${gamesNeedingScores.length} games to in_progress...`)
      
      for (const game of gamesNeedingScores) {
        const { error: updateError } = await supabase
          .from('games')
          .update({
            status: 'in_progress',
            winner_against_spread: null,
            margin_bonus: null,
            base_points: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', game.id)
          
        if (updateError) {
          console.error(`   ❌ Failed to fix ${game.away_team} @ ${game.home_team}: ${updateError.message}`)
        } else {
          console.log(`   ✅ Reset ${game.away_team} @ ${game.home_team} to in_progress`)
        }
      }
    }
    
    // Step 4: Reset games missing winner calculation
    if (noWinner.length > 0) {
      console.log(`\n📝 Resetting ${noWinner.length} games for winner recalculation...`)
      
      for (const game of noWinner) {
        const { error: updateError } = await supabase
          .from('games')
          .update({
            status: 'in_progress',
            updated_at: new Date().toISOString()
          })
          .eq('id', game.id)
          
        if (updateError) {
          console.error(`   ❌ Failed to reset ${game.away_team} @ ${game.home_team}: ${updateError.message}`)
        } else {
          console.log(`   ✅ Reset ${game.away_team} @ ${game.home_team} (${game.away_score}-${game.home_score}) for recalculation`)
        }
      }
    }
    
    console.log('\n✅ FIX COMPLETE!')
    console.log('====================================')
    console.log('🎯 Next steps:')
    console.log('1. CFBD Live Updater will fetch real scores on next run')
    console.log('2. Games will be properly marked complete with actual scores')
    console.log('3. Winner calculations will happen automatically')
    console.log('\n💡 You can manually trigger CFBD update from the admin dashboard')
    
  } catch (error: any) {
    console.error('❌ Fix failed:', error.message)
  }
}

// Export for browser console
declare global {
  interface Window {
    fixIncompleteScores: typeof fixIncompleteScores
  }
}

if (typeof window !== 'undefined') {
  window.fixIncompleteScores = fixIncompleteScores
}

export { fixIncompleteScores }