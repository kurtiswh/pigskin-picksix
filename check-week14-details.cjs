const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function checkWeek14Details() {
  console.log('Checking Week 14 details for Davis C and Joshua Harlow...\n')

  // Search for both users
  const { data: users } = await supabase
    .from('users')
    .select('id, display_name')
    .or('display_name.ilike.%davis c%,display_name.ilike.%joshua harlow%')

  console.log('Found users:')
  console.table(users)

  if (users && users.length > 0) {
    // Get their picks for week 14
    const userIds = users.map(u => u.id)
    
    const { data: picks } = await supabase
      .from('picks')
      .select('user_id, week, season, result, is_lock, points_earned')
      .eq('season', 2024)
      .eq('week', 14)
      .in('user_id', userIds)
      .order('user_id')

    console.log('\nTheir picks for Week 14:')
    console.table(picks)

    // Get their weekly leaderboard entries
    const { data: leaderboard } = await supabase
      .from('weekly_leaderboard')
      .select('display_name, week, total_points, wins, losses, pushes, weekly_rank')
      .eq('season', 2024)
      .eq('week', 14)
      .in('user_id', userIds)

    console.log('\nWeekly leaderboard entries:')
    console.table(leaderboard)
  }
}

checkWeek14Details()
