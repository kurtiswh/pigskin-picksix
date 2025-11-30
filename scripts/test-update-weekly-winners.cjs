// Test updating weekly winners
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://zgdaqbnpgrabbnljmiqu.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testUpdateWeeklyWinners() {
  const season = 2025

  console.log('🔍 Step 1: Check weekly_leaderboard for winners...\n')

  const { data: weeklyData, error: weeklyError } = await supabase
    .from('weekly_leaderboard')
    .select('week, user_id')
    .eq('season', season)
    .eq('weekly_rank', 1)
    .order('week', { ascending: true })

  if (weeklyError) {
    console.error('❌ Error fetching weekly winners:', weeklyError)
    return
  }

  console.log(`✅ Found ${weeklyData?.length || 0} weekly winners:`)
  weeklyData?.forEach(w => {
    console.log(`   Week ${w.week}: ${w.user_id}`)
  })
  console.log('')

  console.log('🔍 Step 2: Check if get_or_create_season_winners RPC exists...\n')

  const { data: rpcData, error: rpcError } = await supabase
    .rpc('get_or_create_season_winners', { p_season: season })

  if (rpcError) {
    console.error('❌ RPC Error:', rpcError)
    console.log('\nThe helper function may not exist. Try running this SQL in Supabase:')
    console.log('SELECT proname FROM pg_proc WHERE proname = \'get_or_create_season_winners\';')
    return
  }

  console.log('✅ RPC function works, season winners ID:', rpcData)
  console.log('')

  console.log('🔍 Step 3: Try to update weekly_winners...\n')

  const weeklyWinners = weeklyData?.map(w => ({
    week: w.week,
    user_id: w.user_id
  })) || []

  console.log('Updating with data:', JSON.stringify(weeklyWinners, null, 2))
  console.log('')

  const { data: updateData, error: updateError } = await supabase
    .from('season_winners')
    .update({ weekly_winners: weeklyWinners })
    .eq('season', season)
    .select()

  if (updateError) {
    console.error('❌ Update Error:', updateError)
    return
  }

  console.log('✅ Update successful!')
  console.log('Updated row:', JSON.stringify(updateData, null, 2))
  console.log('')

  console.log('🔍 Step 4: Verify the data was saved...\n')

  const { data: verifyData, error: verifyError } = await supabase
    .from('season_winners')
    .select('*')
    .eq('season', season)
    .single()

  if (verifyError) {
    console.error('❌ Verification Error:', verifyError)
    return
  }

  console.log('✅ Verified data in database:')
  console.log('   Weekly winners count:', verifyData.weekly_winners?.length || 0)
  console.log('   Weekly winners:', JSON.stringify(verifyData.weekly_winners, null, 2))
  console.log('')
  console.log('🎉 Success! Weekly winners have been updated.')
}

testUpdateWeeklyWinners().catch(console.error)
