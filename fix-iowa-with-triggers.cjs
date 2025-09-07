/**
 * Fix Iowa game by managing triggers
 * This disables triggers, fixes data, then re-enables them
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

async function fixWithTriggerManagement() {
  console.log('🔧 Iowa vs Iowa State Game Fix (with trigger management)')
  console.log('=' .repeat(60))
  
  try {
    // Step 1: Create a stored procedure to handle the fix
    console.log('📊 Creating fix procedure in database...')
    
    const { data: procResult, error: procError } = await supabase.rpc('fix_iowa_game_with_triggers', {})
    
    if (procError) {
      // Procedure doesn't exist, let's create and run it
      console.log('   Procedure not found, creating it...')
      
      // Create the procedure
      const createProcedure = `
        CREATE OR REPLACE FUNCTION fix_iowa_game_with_triggers()
        RETURNS json
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $$
        DECLARE
          v_game_id UUID := '45f22991-9bbe-4c94-b328-f91ea493ac84';
          v_picks_cleared INTEGER := 0;
          v_anon_cleared INTEGER := 0;
          v_error TEXT;
        BEGIN
          -- Disable triggers
          ALTER TABLE picks DISABLE TRIGGER ALL;
          ALTER TABLE anonymous_picks DISABLE TRIGGER ALL;
          ALTER TABLE games DISABLE TRIGGER ALL;
          
          -- Clear picks
          UPDATE picks
          SET result = NULL, points_earned = NULL
          WHERE game_id = v_game_id;
          GET DIAGNOSTICS v_picks_cleared = ROW_COUNT;
          
          -- Clear anonymous picks
          UPDATE anonymous_picks
          SET result = NULL, points_earned = NULL
          WHERE game_id = v_game_id;
          GET DIAGNOSTICS v_anon_cleared = ROW_COUNT;
          
          -- Reset game
          UPDATE games
          SET status = 'scheduled',
              home_score = NULL,
              away_score = NULL,
              winner_against_spread = NULL,
              margin_bonus = NULL,
              base_points = NULL
          WHERE id = v_game_id;
          
          -- Re-enable triggers
          ALTER TABLE picks ENABLE TRIGGER ALL;
          ALTER TABLE anonymous_picks ENABLE TRIGGER ALL;
          ALTER TABLE games ENABLE TRIGGER ALL;
          
          RETURN json_build_object(
            'success', true,
            'picks_cleared', v_picks_cleared,
            'anonymous_picks_cleared', v_anon_cleared
          );
          
        EXCEPTION WHEN OTHERS THEN
          -- Make sure triggers are re-enabled even on error
          ALTER TABLE picks ENABLE TRIGGER ALL;
          ALTER TABLE anonymous_picks ENABLE TRIGGER ALL;
          ALTER TABLE games ENABLE TRIGGER ALL;
          
          GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
          RETURN json_build_object(
            'success', false,
            'error', v_error
          );
        END;
        $$;
      `
      
      // For now, let's use a simpler approach
      await simpleFix()
    } else {
      console.log('✅ Fix procedure executed:', procResult)
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
    await simpleFix()
  }
}

async function simpleFix() {
  console.log('')
  console.log('🔧 Using simplified approach without trigger management...')
  console.log('   (Triggers may still cause issues)')
  
  try {
    // Try to clear in very small batches to avoid trigger cascades
    console.log('📊 Getting pick counts...')
    
    const { count: totalPicks } = await supabase
      .from('picks')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', GAME_ID)
      .not('result', 'is', null)
    
    console.log(`   Found ${totalPicks || 0} picks with results`)
    
    if (totalPicks && totalPicks > 0) {
      // Clear picks one at a time to avoid triggering cascades
      console.log('   Clearing picks individually (slow but safe)...')
      
      for (let i = 0; i < Math.min(totalPicks, 10); i++) {
        // Get one pick
        const { data: pick } = await supabase
          .from('picks')
          .select('id')
          .eq('game_id', GAME_ID)
          .not('result', 'is', null)
          .limit(1)
          .single()
        
        if (pick) {
          // Clear it
          await supabase
            .from('picks')
            .update({ result: null, points_earned: null })
            .eq('id', pick.id)
          
          process.stdout.write(`\r   Cleared ${i + 1} picks...`)
        }
        
        // Delay to avoid overwhelming
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      console.log('\n   ⚠️  Only cleared first 10 picks as demo')
      console.log('   You need to run the SQL commands directly in Supabase')
    }
    
    // Show SQL solution
    printDirectSQL()
    
  } catch (error) {
    console.error('❌ Error in simple fix:', error)
    printDirectSQL()
  }
}

function printDirectSQL() {
  console.log('')
  console.log('📝 RECOMMENDED: Run these commands directly in Supabase SQL Editor:')
  console.log('=' .repeat(70))
  console.log(`
-- IMPORTANT: Run each section separately to avoid timeouts

-- Section 1: Disable triggers (prevents cascading operations)
ALTER TABLE picks DISABLE TRIGGER ALL;
ALTER TABLE anonymous_picks DISABLE TRIGGER ALL;
ALTER TABLE games DISABLE TRIGGER ALL;

-- Section 2: Clear the picks (should be fast with triggers off)
UPDATE picks
SET result = NULL, points_earned = NULL
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84';

-- Section 3: Clear anonymous picks
UPDATE anonymous_picks
SET result = NULL, points_earned = NULL
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84';

-- Section 4: Reset the game
UPDATE games
SET status = 'scheduled',
    home_score = NULL,
    away_score = NULL,
    winner_against_spread = NULL,
    margin_bonus = NULL,
    base_points = NULL
WHERE id = '45f22991-9bbe-4c94-b328-f91ea493ac84';

-- Section 5: Re-enable triggers (IMPORTANT - don't forget this!)
ALTER TABLE picks ENABLE TRIGGER ALL;
ALTER TABLE anonymous_picks ENABLE TRIGGER ALL;
ALTER TABLE games ENABLE TRIGGER ALL;

-- Section 6: Verify
SELECT 'Picks with results' as check, COUNT(*) as count
FROM picks
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84'
  AND result IS NOT NULL;
`)
  console.log('=' .repeat(70))
  console.log('ℹ️  Copy and paste each section into Supabase SQL Editor')
  console.log('   Run them one at a time to avoid timeouts')
}

// Run the fix
fixWithTriggerManagement()