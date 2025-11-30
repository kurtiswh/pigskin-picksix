// Check if season_winners table exists and debug weekly winners update
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkSeasonWinners() {
  console.log('🔍 Checking season_winners table...\n')

  // Check if table exists
  const { data: tables, error: tableError } = await supabase
    .from('season_winners')
    .select('*')
    .limit(1)

  if (tableError) {
    console.error('❌ season_winners table does not exist or has an error:')
    console.error(tableError)
    console.log('\n📋 You need to apply migration 147:')
    console.log('   See database/migrations/README_147.md for instructions')
    return
  }

  console.log('✅ season_winners table exists\n')

  // Check for season 2025 data
  const { data: season2025, error: seasonError } = await supabase
    .from('season_winners')
    .select('*')
    .eq('season', 2025)
    .single()

  if (seasonError && seasonError.code !== 'PGRST116') {
    console.error('❌ Error fetching season 2025:', seasonError)
    return
  }

  if (!season2025) {
    console.log('⚠️  No season_winners row for 2025 yet')
    console.log('   This will be auto-created when you use the admin buttons\n')
  } else {
    console.log('📊 Season 2025 Winners Data:')
    console.log('   Weekly winners:', season2025.weekly_winners?.length || 0, 'weeks')
    console.log('   Point winner:', season2025.point_winner_user_id ? '✓' : '✗')
    console.log('   Lock winner:', season2025.lock_winner_user_id ? '✓' : '✗')
    console.log('   Best finish:', season2025.best_finish_user_id ? '✓' : '✗')
    console.log('   Bracket winner:', season2025.bracket_winner_user_id ? '✓' : '✗')
    console.log('   Total pot:', season2025.total_pot ? `$${season2025.total_pot}` : 'Not set')
    console.log('')
  }

  // Check weekly_leaderboard for potential winners
  console.log('🏆 Checking weekly_leaderboard for winners...\n')

  const { data: weeklyWinners, error: weeklyError } = await supabase
    .from('weekly_leaderboard')
    .select('week, user_id, display_name')
    .eq('season', 2025)
    .eq('weekly_rank', 1)
    .order('week', { ascending: true })

  if (weeklyError) {
    console.error('❌ Error fetching weekly winners:', weeklyError)
    return
  }

  if (!weeklyWinners || weeklyWinners.length === 0) {
    console.log('⚠️  No weekly winners found in weekly_leaderboard')
    console.log('   Make sure weeks are marked complete and leaderboard is updated\n')
  } else {
    console.log(`✅ Found ${weeklyWinners.length} weekly winners:`)
    weeklyWinners.forEach(w => {
      console.log(`   Week ${w.week}: ${w.display_name} (${w.user_id})`)
    })
    console.log('')
  }

  // Check if RPC function exists
  console.log('🔧 Checking helper function...\n')

  const { data: rpcTest, error: rpcError } = await supabase
    .rpc('get_or_create_season_winners', { p_season: 2025 })

  if (rpcError) {
    console.error('❌ RPC function get_or_create_season_winners does not exist:')
    console.error(rpcError)
    console.log('\n📋 Migration 147 may not be fully applied')
  } else {
    console.log('✅ Helper function get_or_create_season_winners works')
    console.log('   Season 2025 row ID:', rpcTest)
    console.log('')
  }
}

checkSeasonWinners().catch(console.error)
