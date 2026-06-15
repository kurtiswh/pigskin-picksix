// Test submission with actual user authentication like the app does
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://zgdaqbnpgrabbnljmiqy.supabase.co',
  process.env.VITE_SUPABASE_ANON_KEY
)

async function testWithRealAuth() {
  console.log('🔐 Testing with different authentication methods...')
  
  try {
    // Get a real user that has Week 3 picks
    const { data: userPicks, error: picksError } = await supabase
      .from('picks')
      .select('user_id, week, season, id')
      .eq('week', 3)
      .eq('season', 2025)
      .limit(1)
    
    if (picksError || !userPicks || userPicks.length === 0) {
      console.log('❌ No Week 3 picks found:', picksError)
      return
    }
    
    const testData = userPicks[0]
    console.log('Testing with:', testData)
    
    // Method 1: Using Supabase client (like my previous tests)
    console.log('\n1. Testing with Supabase client...')
    const { data, error } = await supabase
      .from('picks')
      .update({ 
        submitted: true,
        submitted_at: new Date().toISOString()
      })
      .eq('user_id', testData.user_id)
      .eq('week', testData.week)
      .eq('season', testData.season)
      .select()
    
    if (error) {
      console.log('❌ Supabase client failed:', error)
    } else {
      console.log('✅ Supabase client worked, updated:', data?.length || 0, 'picks')
    }
    
    // Method 2: Using raw fetch with just API key (like app does initially)
    console.log('\n2. Testing with raw fetch + API key...')
    const apiResponse = await fetch(`https://zgdaqbnpgrabbnljmiqy.supabase.co/rest/v1/picks?user_id=eq.${testData.user_id}&week=eq.${testData.week}&season=eq.${testData.season}`, {
      method: 'PATCH',
      headers: {
        'apikey': process.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ 
        submitted: false, // flip it back
        submitted_at: new Date().toISOString()
      })
    })
    
    if (apiResponse.ok) {
      console.log('✅ Raw fetch worked')
    } else {
      const errorText = await apiResponse.text()
      console.log('❌ Raw fetch failed:', errorText)
      console.log('This might be the same error as the submission!')
    }
    
  } catch (err) {
    console.error('❌ Test error:', err)
  }
}

testWithRealAuth()