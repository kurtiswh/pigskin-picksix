const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function checkWeek14() {
  console.log('Checking Week 14 winners in weekly_leaderboard...\n')

  // Get top 5 for week 14
  const { data: top5, error: top5Error } = await supabase
    .from('weekly_leaderboard')
    .select('week, user_id, display_name, total_points, weekly_rank')
    .eq('season', 2024)
    .eq('week', 14)
    .order('weekly_rank', { ascending: true })
    .limit(5)

  if (top5Error) {
    console.error('Error fetching top 5:', top5Error)
  } else {
    console.log('Top 5 players for Week 14:')
    console.table(top5)
  }

  // Get all rank 1 for week 14
  const { data: rank1, error: rank1Error } = await supabase
    .from('weekly_leaderboard')
    .select('week, user_id, display_name, total_points, weekly_rank')
    .eq('season', 2024)
    .eq('week', 14)
    .eq('weekly_rank', 1)

  if (rank1Error) {
    console.error('\nError fetching rank 1:', rank1Error)
  } else {
    console.log('\nAll players with weekly_rank = 1 for Week 14:')
    console.table(rank1)
    const count = rank1 ? rank1.length : 0
    console.log(`\nFound ${count} winner(s)`)
  }
}

checkWeek14()
