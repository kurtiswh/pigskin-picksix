const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function checkLockPushes() {
  console.log('Checking for lock pushes data...')

  // Check actual picks for lock pushes
  const { data: picksData, error: picksError } = await supabase
    .from('picks')
    .select('user_id, week, is_lock, result')
    .eq('season', 2024)
    .eq('is_lock', true)
    .eq('result', 'push')
    .limit(20)

  if (picksError) {
    console.error('Error fetching lock push picks:', picksError)
  } else {
    const count = picksData ? picksData.length : 0
    console.log('Found ' + count + ' lock pushes in picks table')
    if (picksData && picksData.length > 0) {
      console.table(picksData.slice(0, 10))
    }
  }
}

checkLockPushes()
