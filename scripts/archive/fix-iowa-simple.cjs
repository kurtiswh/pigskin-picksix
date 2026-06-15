/**
 * Simple fix for Iowa vs Iowa State game
 * Clears picks by team to avoid timeout
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

async function fixIowaGame() {
  console.log('🔧 Fixing Iowa vs Iowa State game...')
  console.log('   Using team-by-team approach to avoid timeouts')
  console.log('')
  
  try {
    // Step 1: Clear Iowa picks
    console.log('📊 Clearing picks for team: Iowa...')
    const { data: iowaData, error: iowaError } = await supabase
      .from('picks')
      .update({ 
        result: null, 
        points_earned: null,
        updated_at: new Date().toISOString()
      })
      .eq('game_id', GAME_ID)
      .eq('selected_team', 'Iowa')
      .select()
    
    if (iowaError) {
      console.error('❌ Error clearing Iowa picks:', iowaError.message)
    } else {
      console.log(`   ✅ Cleared ${iowaData?.length || 0} Iowa picks`)
    }
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Step 2: Clear Iowa State picks
    console.log('📊 Clearing picks for team: Iowa State...')
    const { data: isuData, error: isuError } = await supabase
      .from('picks')
      .update({ 
        result: null, 
        points_earned: null,
        updated_at: new Date().toISOString()
      })
      .eq('game_id', GAME_ID)
      .eq('selected_team', 'Iowa State')
      .select()
    
    if (isuError) {
      console.error('❌ Error clearing Iowa State picks:', isuError.message)
    } else {
      console.log(`   ✅ Cleared ${isuData?.length || 0} Iowa State picks`)
    }
    
    // Step 3: Clear anonymous picks
    console.log('📊 Clearing anonymous picks...')
    const { data: anonData, error: anonError } = await supabase
      .from('anonymous_picks')
      .update({ 
        result: null, 
        points_earned: null
      })
      .eq('game_id', GAME_ID)
      .select()
    
    if (anonError) {
      console.error('❌ Error clearing anonymous picks:', anonError.message)
    } else {
      console.log(`   ✅ Cleared ${anonData?.length || 0} anonymous picks`)
    }
    
    // Step 4: Reset the game
    console.log('🎮 Resetting game to scheduled status...')
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
      console.error('❌ Error resetting game:', gameError.message)
    } else {
      console.log('   ✅ Game reset successfully')
    }
    
    // Verification
    console.log('')
    console.log('📊 Verification:')
    
    const { data: game } = await supabase
      .from('games')
      .select('home_team, away_team, status, home_score, away_score')
      .eq('id', GAME_ID)
      .single()
    
    if (game) {
      console.log(`   Game: ${game.away_team} @ ${game.home_team}`)
      console.log(`   Status: ${game.status}`)
      console.log(`   Scores: ${game.away_score || 'null'} - ${game.home_score || 'null'}`)
    }
    
    const { count: remainingPicks } = await supabase
      .from('picks')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', GAME_ID)
      .not('result', 'is', null)
    
    console.log(`   Remaining picks with results: ${remainingPicks || 0}`)
    
    if (remainingPicks === 0) {
      console.log('')
      console.log('🎉 SUCCESS! Iowa vs Iowa State game has been reset.')
      console.log('You can now update the scores through the admin interface.')
    } else {
      console.log('')
      console.log('⚠️  Some picks may still have results. You may need to:')
      console.log('   1. Run this script again')
      console.log('   2. Use the SQL commands in fix-iowa-game.sql')
      console.log('   3. Contact support for database assistance')
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

// Run the fix
fixIowaGame()