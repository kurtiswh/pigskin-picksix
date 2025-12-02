const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkBracketWinners() {
  console.log('🔍 Checking bracket winners in database...\n')

  const { data, error } = await supabase
    .from('season_winners')
    .select('*')
    .eq('season', 2025)
    .single()

  if (error) {
    console.error('❌ Error querying season_winners:', error)
    return
  }

  console.log('📊 Season Winners Data:')
  console.log(JSON.stringify(data, null, 2))
  console.log('\n🏆 Bracket Winners:')
  console.log('  Winner:', data.bracket_winner_user_id)
  console.log('  Second:', data.bracket_second_user_id)
}

checkBracketWinners()
