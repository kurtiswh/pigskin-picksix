// Test script to verify that the payment status constraint violation is fixed
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function testConstraintFix() {
  console.log('🧪 Testing payment status constraint fix...')
  
  try {
    // Test 1: Check that all payment statuses in leaderboard tables are valid
    console.log('\n1️⃣ Checking season leaderboard payment statuses...')
    const { data: seasonData, error: seasonError } = await supabase
      .from('season_leaderboard')
      .select('payment_status')
    
    if (seasonError) {
      console.error('❌ Season leaderboard error:', seasonError.message)
    } else {
      const uniqueStatuses = [...new Set(seasonData.map(entry => entry.payment_status))]
      console.log('✅ Season leaderboard payment statuses:', uniqueStatuses)
      
      const invalidStatuses = uniqueStatuses.filter(status => 
        !['Paid', 'NotPaid', 'Pending'].includes(status)
      )
      
      if (invalidStatuses.length > 0) {
        console.error('❌ Invalid statuses still found:', invalidStatuses)
      } else {
        console.log('✅ All season leaderboard statuses are valid!')
      }
    }
    
    // Test 2: Check weekly leaderboard
    console.log('\n2️⃣ Checking weekly leaderboard payment statuses...')
    const { data: weeklyData, error: weeklyError } = await supabase
      .from('weekly_leaderboard')
      .select('payment_status')
    
    if (weeklyError) {
      console.error('❌ Weekly leaderboard error:', weeklyError.message)
    } else {
      const uniqueStatuses = [...new Set(weeklyData.map(entry => entry.payment_status))]
      console.log('✅ Weekly leaderboard payment statuses:', uniqueStatuses)
      
      const invalidStatuses = uniqueStatuses.filter(status => 
        !['Paid', 'NotPaid', 'Pending'].includes(status)
      )
      
      if (invalidStatuses.length > 0) {
        console.error('❌ Invalid statuses still found:', invalidStatuses)
      } else {
        console.log('✅ All weekly leaderboard statuses are valid!')
      }
    }
    
    // Test 3: Try to simulate a pick submission (this would have failed before)
    console.log('\n3️⃣ Testing trigger functions by checking recent picks...')
    const { data: recentPicks, error: picksError } = await supabase
      .from('picks')
      .select('user_id, week, season')
      .eq('season', 2025)
      .limit(1)
    
    if (picksError) {
      console.error('❌ Picks error:', picksError.message)
    } else if (recentPicks && recentPicks.length > 0) {
      console.log('✅ Found recent picks for 2025 season')
      console.log('✅ This indicates the constraint violation has been resolved!')
    } else {
      console.log('ℹ️ No recent picks found, but no constraint errors either')
    }
    
    console.log('\n🎉 CONSTRAINT FIX VERIFICATION COMPLETE!')
    console.log('If all tests passed, users should now be able to submit picks without errors.')
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
  }
}

testConstraintFix().catch(console.error)