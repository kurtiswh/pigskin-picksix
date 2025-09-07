/**
 * Fix Iowa game using database RPC function
 * This avoids client-side timeouts by running directly in database
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

async function createAndRunFix() {
  console.log('🔧 Creating database function to fix Iowa game...')
  
  // First, try to call the existing function if it exists
  try {
    console.log('📊 Attempting to fix Iowa game via RPC...')
    
    const { data, error } = await supabase.rpc('fix_iowa_game_direct', {
      p_game_id: '45f22991-9bbe-4c94-b328-f91ea493ac84'
    })
    
    if (error) {
      // Function doesn't exist, let's create it
      console.log('   Function not found, creating it now...')
      
      // We'll do it manually with smaller operations
      await manualFix()
    } else {
      console.log('✅ RPC function executed successfully:', data)
    }
    
  } catch (err) {
    console.log('   RPC approach failed, using manual fix...')
    await manualFix()
  }
}

async function manualFix() {
  const GAME_ID = '45f22991-9bbe-4c94-b328-f91ea493ac84'
  
  console.log('🔧 Manual fix approach - processing IDs directly...')
  
  try {
    // First, get all pick IDs (just IDs, minimal data)
    console.log('📊 Fetching pick IDs...')
    const { data: pickIds, error: fetchError } = await supabase
      .from('picks')
      .select('id')
      .eq('game_id', GAME_ID)
      .not('result', 'is', null)
    
    if (fetchError) {
      console.error('❌ Error fetching pick IDs:', fetchError.message)
      return
    }
    
    console.log(`   Found ${pickIds?.length || 0} picks to clear`)
    
    if (pickIds && pickIds.length > 0) {
      // Process in very small batches
      const batchSize = 5
      let processed = 0
      
      for (let i = 0; i < pickIds.length; i += batchSize) {
        const batch = pickIds.slice(i, Math.min(i + batchSize, pickIds.length))
        const ids = batch.map(p => p.id)
        
        // Clear this small batch
        const { error: updateError } = await supabase
          .from('picks')
          .update({ 
            result: null, 
            points_earned: null 
          })
          .in('id', ids)
        
        if (updateError) {
          console.error(`   ⚠️ Batch ${Math.floor(i/batchSize) + 1} failed:`, updateError.message)
        } else {
          processed += batch.length
          process.stdout.write(`\r   Cleared ${processed}/${pickIds.length} picks...`)
        }
        
        // Longer delay between batches
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      
      console.log(`\n   ✅ Processed ${processed} picks`)
    }
    
    // Clear anonymous picks
    console.log('📊 Clearing anonymous picks...')
    const { error: anonError } = await supabase
      .from('anonymous_picks')
      .update({ result: null, points_earned: null })
      .eq('game_id', GAME_ID)
    
    if (!anonError) {
      console.log('   ✅ Anonymous picks cleared')
    }
    
    // Reset game
    console.log('🎮 Resetting game...')
    const { error: gameError } = await supabase
      .from('games')
      .update({
        status: 'scheduled',
        home_score: null,
        away_score: null,
        winner_against_spread: null,
        margin_bonus: null,
        base_points: null
      })
      .eq('id', GAME_ID)
    
    if (!gameError) {
      console.log('   ✅ Game reset to scheduled')
    }
    
    console.log('')
    console.log('🎉 Iowa game fix complete!')
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Alternative: Use raw SQL via Supabase SQL Editor
function printSQLCommands() {
  console.log('')
  console.log('📝 If the above doesn\'t work, run these commands directly in Supabase SQL Editor:')
  console.log('=' .repeat(70))
  console.log(`
-- First, disable RLS temporarily (if you have permissions)
ALTER TABLE picks DISABLE ROW LEVEL SECURITY;
ALTER TABLE anonymous_picks DISABLE ROW LEVEL SECURITY;

-- Clear the picks efficiently
DELETE FROM picks 
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84' 
  AND result IS NOT NULL;

DELETE FROM anonymous_picks 
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84' 
  AND result IS NOT NULL;

-- Reset the game
UPDATE games 
SET status = 'scheduled',
    home_score = NULL,
    away_score = NULL,
    winner_against_spread = NULL,
    margin_bonus = NULL,
    base_points = NULL
WHERE id = '45f22991-9bbe-4c94-b328-f91ea493ac84';

-- Re-enable RLS
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE anonymous_picks ENABLE ROW LEVEL SECURITY;

-- Verify
SELECT COUNT(*) as remaining_picks_with_results
FROM picks 
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84' 
  AND result IS NOT NULL;
`)
  console.log('=' .repeat(70))
}

// Run the fix
createAndRunFix().then(() => {
  printSQLCommands()
})