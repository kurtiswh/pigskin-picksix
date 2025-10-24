const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkSeasonLeaderboard() {
  console.log('🔍 Checking season_leaderboard table...\n')
  
  // Check for 2025 season data
  const { data, error } = await supabase
    .from('season_leaderboard')
    .select('*')
    .eq('season', 2025)
    .limit(5)
  
  if (error) {
    console.error('Error:', error)
    return
  }
  
  console.log(`Found ${data?.length || 0} entries for season 2025`)
  
  if (data && data.length > 0) {
    console.log('\nSample entry:')
    console.log(data[0])
    
    // Calculate totals
    const totalWins = data.reduce((sum, user) => sum + (user.wins || 0), 0)
    const totalLosses = data.reduce((sum, user) => sum + (user.losses || 0), 0)
    const totalLockWins = data.reduce((sum, user) => sum + (user.lock_wins || 0), 0)
    const totalLockLosses = data.reduce((sum, user) => sum + (user.lock_losses || 0), 0)
    
    console.log('\nSeason totals (first 5 users):')
    console.log(`Regular: ${totalWins}-${totalLosses}`)
    console.log(`Locks: ${totalLockWins}-${totalLockLosses}`)
  }
  
  // Also check total count
  const { count } = await supabase
    .from('season_leaderboard')
    .select('*', { count: 'exact', head: true })
    .eq('season', 2025)
  
  console.log(`\nTotal entries in season_leaderboard for 2025: ${count}`)
}

checkSeasonLeaderboard()