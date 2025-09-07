#!/usr/bin/env node

/**
 * Cleanup Script: Remove incorrect winner_against_spread data
 * for non-completed games
 */

const { createClient } = require('@supabase/supabase-js')

// Environment setup
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zgdaqbnpgrabbmljmiqy.supabase.co'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseKey) {
  console.error('❌ Missing VITE_SUPABASE_ANON_KEY environment variable')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function cleanupIncorrectWinners() {
  console.log('🧹 CLEANING UP INCORRECT WINNER DATA...')
  console.log('====================================')
  
  try {
    // First, check what we have
    console.log('\n📊 BEFORE CLEANUP:')
    
    const { data: beforeData, error: beforeError } = await supabase
      .from('games')
      .select('id, home_team, away_team, status, winner_against_spread, margin_bonus')
      .eq('season', 2025)
      .eq('week', 2)
      .not('winner_against_spread', 'is', null)
    
    if (beforeError) {
      console.error('❌ Error checking before data:', beforeError)
      return
    }
    
    console.log(`Found ${beforeData.length} games with winner_against_spread set:`)
    beforeData.forEach(game => {
      console.log(`  ${game.away_team} @ ${game.home_team}: ${game.status} -> ${game.winner_against_spread} (margin: ${game.margin_bonus})`)
    })
    
    // Clean up non-completed games
    console.log('\n🚨 CLEANING UP NON-COMPLETED GAMES:')
    
    const { data: cleanupData, error: cleanupError } = await supabase
      .from('games')
      .update({
        winner_against_spread: null,
        margin_bonus: null,
        base_points: null,
        updated_at: new Date().toISOString()
      })
      .eq('season', 2025)
      .eq('week', 2)
      .neq('status', 'completed')
      .not('winner_against_spread', 'is', null)
      .select()
    
    if (cleanupError) {
      console.error('❌ Error during cleanup:', cleanupError)
      return
    }
    
    console.log(`✅ Cleaned up ${cleanupData.length} non-completed games:`)
    cleanupData.forEach(game => {
      console.log(`  ${game.away_team} @ ${game.home_team}: ${game.status} -> winner data cleared`)
    })
    
    // Check final state
    console.log('\n📊 AFTER CLEANUP:')
    
    const { data: afterData, error: afterError } = await supabase
      .from('games')
      .select('id, home_team, away_team, status, winner_against_spread, margin_bonus')
      .eq('season', 2025)
      .eq('week', 2)
      .not('winner_against_spread', 'is', null)
    
    if (afterError) {
      console.error('❌ Error checking after data:', afterError)
      return
    }
    
    console.log(`Now ${afterData.length} games have winner_against_spread set (should only be completed games):`)
    afterData.forEach(game => {
      console.log(`  ${game.away_team} @ ${game.home_team}: ${game.status} -> ${game.winner_against_spread} (margin: ${game.margin_bonus})`)
    })
    
    console.log('\n✅ CLEANUP COMPLETE!')
    console.log('Now test CFBD updates to see if the issue recurs.')
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error)
  }
}

cleanupIncorrectWinners()