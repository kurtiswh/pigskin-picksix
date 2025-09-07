/**
 * Fix Iowa vs Iowa State game - clear all pick results
 * Run this with: node fix-iowa-game.cjs
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const GAME_ID = '45f22991-9bbe-4c94-b328-f91ea493ac84'
const BATCH_SIZE = 20 // Small batch size to avoid timeouts

async function clearPicksInBatches() {
  console.log('🔧 Fixing Iowa vs Iowa State game picks...')
  console.log(`   Game ID: ${GAME_ID}`)
  console.log('')
  
  try {
    // First, get a count of picks to process
    const { count: totalPicks, error: countError } = await supabase
      .from('picks')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', GAME_ID)
      .not('result', 'is', null)
    
    if (countError) {
      console.error('❌ Error counting picks:', countError)
      return
    }
    
    console.log(`📊 Found ${totalPicks || 0} picks with results to clear`)
    
    if (!totalPicks || totalPicks === 0) {
      console.log('✅ No picks need clearing')
      return
    }
    
    // Process in batches
    let processed = 0
    let hasMore = true
    
    while (hasMore) {
      // Get a batch of picks that need clearing
      const { data: picks, error: fetchError } = await supabase
        .from('picks')
        .select('id')
        .eq('game_id', GAME_ID)
        .not('result', 'is', null)
        .limit(BATCH_SIZE)
      
      if (fetchError) {
        console.error('❌ Error fetching picks:', fetchError)
        break
      }
      
      if (!picks || picks.length === 0) {
        hasMore = false
        break
      }
      
      // Clear this batch
      const pickIds = picks.map(p => p.id)
      const { error: updateError } = await supabase
        .from('picks')
        .update({ 
          result: null, 
          points_earned: null,
          updated_at: new Date().toISOString()
        })
        .in('id', pickIds)
      
      if (updateError) {
        console.error('❌ Error updating batch:', updateError)
        break
      }
      
      processed += picks.length
      console.log(`   ✅ Cleared ${processed}/${totalPicks} picks...`)
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
      
      if (picks.length < BATCH_SIZE) {
        hasMore = false
      }
    }
    
    console.log(`✅ Successfully cleared ${processed} regular picks`)
    
    // Now clear anonymous picks
    console.log('')
    console.log('🔧 Clearing anonymous picks...')
    
    const { count: anonCount } = await supabase
      .from('anonymous_picks')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', GAME_ID)
      .not('result', 'is', null)
    
    if (anonCount && anonCount > 0) {
      console.log(`📊 Found ${anonCount} anonymous picks to clear`)
      
      // Clear all anonymous picks for this game
      const { error: anonError } = await supabase
        .from('anonymous_picks')
        .update({ 
          result: null, 
          points_earned: null 
        })
        .eq('game_id', GAME_ID)
      
      if (anonError) {
        console.error('❌ Error clearing anonymous picks:', anonError)
      } else {
        console.log(`✅ Cleared ${anonCount} anonymous picks`)
      }
    } else {
      console.log('✅ No anonymous picks need clearing')
    }
    
    // Reset the game itself
    console.log('')
    console.log('🔧 Resetting game status...')
    
    const { error: gameError } = await supabase
      .from('games')
      .update({
        status: 'scheduled',
        home_score: null,
        away_score: null,
        winner_against_spread: null,
        margin_bonus: null,
        base_points: null,
        game_period: null,
        game_clock: null,
        api_period: null,
        api_clock: null,
        api_home_points: null,
        api_away_points: null,
        api_completed: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', GAME_ID)
    
    if (gameError) {
      console.error('❌ Error resetting game:', gameError)
    } else {
      console.log('✅ Game reset to scheduled status')
    }
    
    // Final verification
    console.log('')
    console.log('📊 Final verification:')
    
    const { data: gameData } = await supabase
      .from('games')
      .select('home_team, away_team, status, home_score, away_score')
      .eq('id', GAME_ID)
      .single()
    
    if (gameData) {
      console.log(`   Game: ${gameData.away_team} @ ${gameData.home_team}`)
      console.log(`   Status: ${gameData.status}`)
      console.log(`   Scores: ${gameData.away_score || 'null'} - ${gameData.home_score || 'null'}`)
    }
    
    const { count: remainingPicks } = await supabase
      .from('picks')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', GAME_ID)
      .not('result', 'is', null)
    
    console.log(`   Picks with results: ${remainingPicks || 0} (should be 0)`)
    
    console.log('')
    console.log('🎉 Iowa vs Iowa State game fix complete!')
    console.log('You can now update the game scores normally.')
    
  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

// Run the fix
clearPicksInBatches()