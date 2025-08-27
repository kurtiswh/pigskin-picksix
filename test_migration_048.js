// Test script to verify Migration 048 fixes the anonymous picks RLS policies
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function testMigration048Fix() {
  console.log('🧪 Testing Migration 048: Fix RLS policies for anonymous_picks table')
  console.log('='.repeat(80))
  console.log()
  
  console.log('🔍 PROBLEM ANALYSIS:')
  console.log('- Anonymous picks management page flashing with 401 errors')
  console.log('- Error occurs at AnonymousPicksAdmin.tsx:424 during PATCH requests')
  console.log('- RLS policies block anonymous users from UPDATE operations on anonymous_picks')
  console.log('- Migration 047 fixed triggers, but direct API calls still blocked')
  console.log()
  
  try {
    // Test 1: Check if anonymous users can now read anonymous_picks
    console.log('1️⃣ Testing READ access to anonymous_picks table...')
    
    const { data: readData, error: readError } = await supabase
      .from('anonymous_picks')
      .select('id, email, assigned_user_id, show_on_leaderboard')
      .limit(3)
    
    if (readError) {
      console.log('❌ READ access blocked:', readError.code, readError.message)
      console.log('❌ Migration 048 may not have been applied correctly')
    } else {
      console.log('✅ READ access granted:', readData?.length || 0, 'records found')
      console.log('✅ Management interface can load anonymous picks')
    }
    
    // Test 2: Test UPDATE access (the main issue)
    console.log('\\n2️⃣ Testing UPDATE access for assignment operations...')
    
    if (readData && readData.length > 0) {
      const testRecord = readData[0]
      console.log('Testing UPDATE on record:', testRecord.id)
      
      // Try to update assignment fields (this was failing before)
      const { error: updateError } = await supabase
        .from('anonymous_picks')
        .update({
          assigned_user_id: '12345678-1234-5678-9012-123456789012',
          show_on_leaderboard: true
        })
        .eq('id', testRecord.id)
      
      if (updateError) {
        console.log('❌ UPDATE still blocked:', updateError.code, updateError.message)
        console.log('❌ This means Migration 048 did not fix the RLS policies')
        console.log('❌ Anonymous picks assignment will still fail')
      } else {
        console.log('✅ UPDATE access granted - assignment operations will work!')
        console.log('✅ Anonymous picks management should no longer flash')
        
        // Revert the test change
        await supabase
          .from('anonymous_picks')
          .update({
            assigned_user_id: null,
            show_on_leaderboard: false
          })
          .eq('id', testRecord.id)
        
        console.log('✅ Test change reverted')
      }
    } else {
      console.log('⚠️ No anonymous picks found to test UPDATE operations')
      console.log('⚠️ Migration effectiveness cannot be fully verified without test data')
    }
    
    // Test 3: Test INSERT access (should still work)
    console.log('\\n3️⃣ Testing INSERT access (should be preserved)...')
    
    const testPick = {
      email: 'test-migration-048@example.com',
      name: 'Migration Test',
      week: 1,
      season: 2025,
      game_id: '999999',
      home_team: 'Test Home',
      away_team: 'Test Away',
      selected_team: 'Test Home',
      is_lock: false,
      is_validated: false,
      submitted_at: new Date().toISOString()
    }
    
    const { data: insertData, error: insertError } = await supabase
      .from('anonymous_picks')
      .insert(testPick)
      .select()
    
    if (insertError) {
      console.log('❌ INSERT blocked:', insertError.code, insertError.message)
      console.log('⚠️ Migration may have broken pick creation functionality')
    } else {
      console.log('✅ INSERT access preserved - pick creation still works')
      
      // Clean up test record
      if (insertData && insertData.length > 0) {
        await supabase
          .from('anonymous_picks')
          .delete()
          .eq('id', insertData[0].id)
        console.log('✅ Test record cleaned up')
      }
    }
    
    console.log('\\n🎯 MIGRATION 048 EXPECTED RESULTS:')
    console.log('✅ Anonymous picks management page should load without flashing')
    console.log('✅ No more 401 \"Failed to assign pick\" errors')
    console.log('✅ Assignment operations (assign/unassign/toggle leaderboard) should work')
    console.log('✅ Anonymous pick creation functionality preserved')
    console.log()
    console.log('📋 TO APPLY MIGRATION 048:')
    console.log('1. Copy the SQL from Migration 048 to Supabase Dashboard > SQL Editor')
    console.log('2. Execute the migration')
    console.log('3. Test the anonymous picks management page')
    console.log('4. Verify no more flashing or 401 errors occur')
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
  }
}

testMigration048Fix().catch(console.error)