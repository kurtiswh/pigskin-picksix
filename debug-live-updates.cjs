const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zgdaqbnpgrabbnljmiqy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugLiveUpdates() {
  console.log('🔍 Debugging Live Updates Function');
  console.log('===================================');
  
  try {
    // 1. Check active week
    console.log('\n1. Checking active week...');
    const { data: activeWeeks, error: weekError } = await supabase
      .from('week_settings')
      .select('week, season, picks_open')
      .eq('picks_open', true)
      .order('week', { ascending: false });
    
    if (weekError) {
      console.error('❌ Week error:', weekError.message);
      return;
    }
    
    if (!activeWeeks || activeWeeks.length === 0) {
      console.log('❌ No active weeks found');
      return;
    }
    
    console.log('✅ Active weeks:', activeWeeks);
    const activeWeek = activeWeeks[0];
    
    // 2. Check games for active week
    console.log(`\n2. Checking games for Week ${activeWeek.week} Season ${activeWeek.season}...`);
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('id, home_team, away_team, home_score, away_score, status, kickoff_time, winner_against_spread, margin_bonus')
      .eq('season', activeWeek.season)
      .eq('week', activeWeek.week)
      .order('kickoff_time', { ascending: true });
    
    if (gamesError) {
      console.error('❌ Games error:', gamesError.message);
      return;
    }
    
    if (!games || games.length === 0) {
      console.log('❌ No games found for this week');
      return;
    }
    
    console.log(`✅ Found ${games.length} games for this week:`);
    
    // 3. Analyze each game
    console.log('\n3. Game Analysis:');
    games.forEach((game, index) => {
      const kickoff = new Date(game.kickoff_time);
      const now = new Date();
      const hoursFromKickoff = (now.getTime() - kickoff.getTime()) / (1000 * 60 * 60);
      
      console.log(`\n   Game ${index + 1}: ${game.away_team} @ ${game.home_team}`);
      console.log(`   Status: ${game.status}`);
      console.log(`   Scores: ${game.away_score} - ${game.home_score}`);
      console.log(`   Kickoff: ${kickoff.toLocaleString()}`);
      console.log(`   Hours from kickoff: ${hoursFromKickoff.toFixed(1)}`);
      console.log(`   Winner ATS: ${game.winner_against_spread || 'Not set'}`);
      console.log(`   Margin Bonus: ${game.margin_bonus || 'Not set'}`);
      
      // Determine what should happen to this game
      if (game.status === 'scheduled' && hoursFromKickoff > -0.5) {
        console.log(`   🔄 SHOULD UPDATE: Game should be in_progress or completed`);
      } else if (game.status === 'in_progress' && hoursFromKickoff > 4) {
        console.log(`   🔄 SHOULD UPDATE: Game likely completed (4+ hours elapsed)`);
      } else if (game.status === 'completed' && !game.winner_against_spread) {
        console.log(`   🔄 SHOULD UPDATE: Completed game missing winner calculation`);
      } else if (game.status !== 'completed' && (game.home_score > 0 || game.away_score > 0)) {
        console.log(`   🔄 SHOULD UPDATE: Has scores but not completed`);
      } else {
        console.log(`   ✅ OK: Game status appears correct`);
      }
    });
    
    // 4. Check CFBD API connectivity
    console.log('\n4. Testing CFBD API connectivity...');
    const cfbdKey = '5gD7uFdxP7c0qvNZRaVlzOsA0Nwk8mtXE2xU7oaFvY2W3PuDzHr9/szj+9NWqtqa';
    
    try {
      const response = await fetch(
        `https://api.collegefootballdata.com/scoreboard?year=${activeWeek.season}&week=${activeWeek.week}&classification=fbs`,
        {
          headers: {
            'Authorization': `Bearer ${cfbdKey}`
          }
        }
      );
      
      if (!response.ok) {
        console.log(`❌ CFBD API Error: ${response.status} - ${response.statusText}`);
        return;
      }
      
      const cfbdGames = await response.json();
      console.log(`✅ CFBD API returned ${cfbdGames.length} games`);
      
      // 5. Compare database games with CFBD games
      console.log('\n5. Database vs CFBD Comparison:');
      
      cfbdGames.forEach((cfbdGame, index) => {
        if (index < 5) { // Show first 5 games
          console.log(`\n   CFBD Game ${index + 1}: ${cfbdGame.awayTeam?.name} @ ${cfbdGame.homeTeam?.name}`);
          console.log(`   CFBD Status: ${cfbdGame.status}`);
          console.log(`   CFBD Scores: ${cfbdGame.awayTeam?.points || 0} - ${cfbdGame.homeTeam?.points || 0}`);
          console.log(`   CFBD Completed: ${cfbdGame.completed}`);
          
          // Try to find matching database game
          const dbGame = games.find(g => 
            g.home_team.toLowerCase().includes(cfbdGame.homeTeam?.name?.toLowerCase()?.substring(0, 5) || '') ||
            cfbdGame.homeTeam?.name?.toLowerCase()?.includes(g.home_team.toLowerCase().substring(0, 5) || '')
          );
          
          if (dbGame) {
            console.log(`   📊 DB Match: ${dbGame.away_team} @ ${dbGame.home_team} (${dbGame.status})`);
            console.log(`   📊 DB Scores: ${dbGame.away_score} - ${dbGame.home_score}`);
            
            if (cfbdGame.status !== dbGame.status) {
              console.log(`   🔄 STATUS MISMATCH: CFBD=${cfbdGame.status}, DB=${dbGame.status}`);
            }
            if ((cfbdGame.awayTeam?.points || 0) !== (dbGame.away_score || 0) || 
                (cfbdGame.homeTeam?.points || 0) !== (dbGame.home_score || 0)) {
              console.log(`   🔄 SCORE MISMATCH: CFBD=${cfbdGame.awayTeam?.points || 0}-${cfbdGame.homeTeam?.points || 0}, DB=${dbGame.away_score || 0}-${dbGame.home_score || 0}`);
            }
          } else {
            console.log(`   ❌ No DB match found`);
          }
        }
      });
      
    } catch (apiError) {
      console.log('❌ CFBD API Error:', apiError.message);
    }
    
    console.log('\n📋 DIAGNOSIS SUMMARY:');
    console.log('The live updates function is only checking games, not actually updating them.');
    console.log('It needs to:');
    console.log('1. Fetch data from CFBD API');
    console.log('2. Compare with database games'); 
    console.log('3. Update games that have changed');
    console.log('4. Calculate winner_against_spread for completed games');
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

debugLiveUpdates();