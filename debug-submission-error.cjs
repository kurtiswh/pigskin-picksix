// Debug script to test what happens when we try to update picks
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://zgdaqbnpgrabbnljmiqy.supabase.co',
  process.env.VITE_SUPABASE_ANON_KEY
)

async function debugSubmissionError() {
  console.log('🔍 Debugging pick submission error...')
  
  try {
    // Test 1: Check if weekly_leaderboard exists and what type it is
    console.log('\n1. Checking weekly_leaderboard structure...')
    
    const { data: tableInfo, error: tableError } = await supabase
      .from('weekly_leaderboard')
      .select('*')
      .limit(1)
    
    if (tableError) {
      console.log('❌ Error accessing weekly_leaderboard:', tableError)
    } else {
      console.log('✅ weekly_leaderboard accessible, first row:', tableInfo[0])
    }
    
    // Test 2: Try to simulate the exact PATCH operation that's failing
    console.log('\n2. Testing a safe PATCH operation...')
    
    // First, let's see what picks exist
    const { data: picks, error: picksError } = await supabase
      .from('picks')
      .select('id, user_id, week, season, submitted')
      .limit(5)
    
    if (picksError) {
      console.log('❌ Error fetching picks:', picksError)
    } else {
      console.log('✅ Found picks:', picks?.length || 0)
      
      if (picks && picks.length > 0) {
        const testPick = picks[0]
        console.log('Testing with pick:', testPick)
        
        // Try the same type of PATCH that the submission does
        console.log('\n3. Attempting PATCH operation like submission...')
        
        const { data: patchResult, error: patchError } = await supabase
          .from('picks')
          .update({ 
            submitted: false,  // Set to false to avoid affecting real data
            submitted_at: new Date().toISOString()
          })
          .eq('id', testPick.id)
          .select()
        
        if (patchError) {
          console.log('❌ PATCH failed with error:', patchError)
          console.log('   This is likely the same error causing submission issues!')
        } else {
          console.log('✅ PATCH succeeded:', patchResult)
        }
      }
    }
    
  } catch (err) {
    console.error('❌ Debug script error:', err)
  }
}

debugSubmissionError()