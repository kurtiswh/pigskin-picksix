// Check table structure for debugging the updated_at column issue
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkTableStructure() {
  console.log('🔍 Checking table structures...')
  
  try {
    // Check if we can query the weekly_leaderboard table
    console.log('\n📋 Checking weekly_leaderboard table...')
    const { data, error } = await supabase
      .from('weekly_leaderboard')
      .select('*')
      .limit(1)
    
    if (error) {
      console.log('❌ Error querying weekly_leaderboard:', error.message)
    } else {
      console.log('✅ weekly_leaderboard table accessible')
      if (data && data.length > 0) {
        console.log('📝 Sample columns:', Object.keys(data[0]))
        console.log('🔍 Has updated_at?', 'updated_at' in data[0])
      } else {
        console.log('⚠️  No data in table')
      }
    }
    
    // Check season_leaderboard table
    console.log('\n📋 Checking season_leaderboard table...')
    const { data: seasonData, error: seasonError } = await supabase
      .from('season_leaderboard')
      .select('*')
      .limit(1)
    
    if (seasonError) {
      console.log('❌ Error querying season_leaderboard:', seasonError.message)
    } else {
      console.log('✅ season_leaderboard table accessible')
      if (seasonData && seasonData.length > 0) {
        console.log('📝 Sample columns:', Object.keys(seasonData[0]))
        console.log('🔍 Has updated_at?', 'updated_at' in seasonData[0])
      } else {
        console.log('⚠️  No data in table')
      }
    }
    
    // Check leaguesafe_payments table structure
    console.log('\n📋 Checking leaguesafe_payments table...')
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('leaguesafe_payments')
      .select('*')
      .limit(1)
    
    if (paymentsError) {
      console.log('❌ Error querying leaguesafe_payments:', paymentsError.message)
    } else {
      console.log('✅ leaguesafe_payments table accessible')
      if (paymentsData && paymentsData.length > 0) {
        console.log('📝 Sample columns:', Object.keys(paymentsData[0]))
      } else {
        console.log('⚠️  No data in table')
      }
    }
    
  } catch (err) {
    console.error('💥 Unexpected error:', err)
  }
}

checkTableStructure()