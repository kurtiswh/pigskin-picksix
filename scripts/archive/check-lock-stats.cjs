const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zgdaqbnpgrabbmljmiqu.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('Missing VITE_SUPABASE_ANON_KEY environment variable');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLockStats() {
  try {
    console.log('=== Checking Lock Statistics ===');
    
    // Check games for Week 15, 2025
    const { data: games, error } = await supabase
      .from('games')
      .select('id, week, season, home_team, away_team, home_team_locks, away_team_locks, total_picks, status')
      .eq('season', 2025)
      .eq('week', 15)
      .order('kickoff_time');
      
    if (error) {
      console.error('Error fetching games:', error);
      return;
    }
    
    console.log(`Found ${games.length} games for Week 15, 2025`);
    games.forEach((game, i) => {
      console.log(`${i+1}. ${game.away_team} @ ${game.home_team}`);
      console.log(`   Status: ${game.status}`);
      console.log(`   Home locks: ${game.home_team_locks || 0}, Away locks: ${game.away_team_locks || 0}`);
      console.log(`   Total picks: ${game.total_picks || 0}`);
      console.log('');
    });
    
    // Check if any picks with locks exist
    const { data: lockPicks, error: lockError } = await supabase
      .from('picks')
      .select('id, game_id, selected_team, is_lock')
      .eq('season', 2025)
      .eq('week', 15)
      .eq('is_lock', true)
      .limit(10);
      
    if (!lockError && lockPicks) {
      console.log(`Found ${lockPicks.length} lock picks in picks table`);
    }
    
    // Check anonymous lock picks
    const { data: anonLocks, error: anonError } = await supabase
      .from('anonymous_picks')
      .select('id, game_id, selected_team, is_lock')
      .eq('season', 2025)
      .eq('week', 15)
      .eq('is_lock', true)
      .limit(10);
      
    if (!anonError && anonLocks) {
      console.log(`Found ${anonLocks.length} lock picks in anonymous_picks table`);
    }
    
  } catch (err) {
    console.error('Script error:', err);
  }
}

checkLockStats();