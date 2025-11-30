// Check season_leaderboard table columns
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkColumns() {
  console.log('🔍 Checking season_leaderboard columns...\n')

  // Get sample data to see column names
  const { data, error } = await supabase
    .from('season_leaderboard')
    .select('*')
    .eq('season', 2025)
    .limit(1)

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  if (data && data.length > 0) {
    console.log('✅ Available columns in season_leaderboard:')
    Object.keys(data[0]).forEach(col => {
      console.log(`   - ${col}: ${data[0][col]}`)
    })
  } else {
    console.log('⚠️  No data in season_leaderboard for 2025')
  }

  console.log('\n🔍 Checking weekly_leaderboard columns...\n')

  const { data: weeklyData, error: weeklyError } = await supabase
    .from('weekly_leaderboard')
    .select('*')
    .eq('season', 2025)
    .limit(1)

  if (weeklyError) {
    console.error('❌ Error:', weeklyError)
    return
  }

  if (weeklyData && weeklyData.length > 0) {
    console.log('✅ Available columns in weekly_leaderboard:')
    Object.keys(weeklyData[0]).forEach(col => {
      console.log(`   - ${col}: ${weeklyData[0][col]}`)
    })
  }
}

checkColumns().catch(console.error)
