const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Replicating the logic from liveUpdateService.ts
function isInPollingWindow() {
  // Get current time in Central Time (America/Chicago)
  const now = new Date()
  const centralTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Chicago"}))
  
  const day = centralTime.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const hour = centralTime.getHours()
  const minute = centralTime.getMinutes()
  const timeInMinutes = hour * 60 + minute

  console.log(`Current Central Time: ${centralTime.toLocaleString()}`)
  console.log(`Day of week: ${day} (0=Sun, 1=Mon, ..., 6=Sat)`)
  console.log(`Hour: ${hour}, Minutes: ${minute}, Total minutes: ${timeInMinutes}`)

  // Define polling window: Thursday 6pm - Sunday 8am Central
  if (day === 4) { // Thursday
    // Thursday 6:00 PM onwards (18:00)
    const inWindow = timeInMinutes >= 18 * 60 // 6pm = 1080 minutes
    console.log(`Thursday: ${inWindow ? 'IN' : 'OUT OF'} window (need >= 6pm/1080min, have ${timeInMinutes}min)`)
    return inWindow
  } else if (day === 5 || day === 6) { // Friday or Saturday
    // All day Friday and Saturday
    console.log(`Friday/Saturday: IN window (all day)`)
    return true
  } else if (day === 0) { // Sunday
    // Sunday until 8:00 AM (08:00)
    const inWindow = timeInMinutes < 8 * 60 // 8am = 480 minutes
    console.log(`Sunday: ${inWindow ? 'IN' : 'OUT OF'} window (need < 8am/480min, have ${timeInMinutes}min)`)
    return inWindow
  }
  
  console.log(`Other day (Mon/Tue/Wed): OUT OF window`)
  return false // Monday, Tuesday, Wednesday, or Sunday after 8am
}

async function checkStopConditions() {
  try {
    console.log('🔍 Checking Live Update Stop Conditions\n');
    
    // Condition 1: Polling Window
    console.log('=== CONDITION 1: Polling Window ===');
    const inWindow = isInPollingWindow();
    console.log(`Result: ${inWindow ? '✅ IN polling window' : '❌ OUT OF polling window - WOULD STOP'}\n`);
    
    // Condition 2: Active Weeks
    console.log('=== CONDITION 2: Active Weeks ===');
    const { data: activeWeeks, error: weeksError } = await supabase
      .from('week_settings')
      .select('week, season, picks_open')
      .eq('picks_open', true)
      .order('week', { ascending: false });
    
    if (weeksError) throw weeksError;
    
    console.log(`Active weeks found: ${activeWeeks?.length || 0}`);
    if (activeWeeks && activeWeeks.length > 0) {
      activeWeeks.forEach(week => {
        console.log(`  Week ${week.week}, Season ${week.season}, Picks Open: ${week.picks_open}`);
      });
      console.log('✅ Has active weeks - would continue\n');
    } else {
      console.log('❌ No active weeks - WOULD STOP (early return, not stopPolling)\n');
    }
    
    if (!activeWeeks || activeWeeks.length === 0) {
      console.log('⚠️ No active weeks, skipping game completion checks\n');
      return;
    }
    
    const activeWeek = activeWeeks[0];
    
    // Condition 3: All Games Completed (before update)
    console.log('=== CONDITION 3: All Games Completed (Pre-Update) ===');
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('id, status, home_team, away_team')
      .eq('season', activeWeek.season)
      .eq('week', activeWeek.week);
    
    if (gamesError) throw gamesError;
    
    const totalCount = games?.length || 0;
    const completedCount = games?.filter(game => game.status === 'completed').length || 0;
    const allCompleted = totalCount > 0 && completedCount === totalCount;
    
    console.log(`Games: ${completedCount}/${totalCount} completed`);
    if (games) {
      games.forEach(game => {
        console.log(`  ${game.away_team} @ ${game.home_team}: ${game.status}`);
      });
    }
    console.log(`Result: ${allCompleted ? '❌ ALL COMPLETED - WOULD STOP' : '✅ Not all completed - would continue'}\n`);
    
    // Condition 4: All Games Completed (after update)
    console.log('=== CONDITION 4: Active Games Check ===');
    const activeGames = games?.filter(game => game.status === 'in_progress') || [];
    console.log(`Active games: ${activeGames.length}`);
    if (activeGames.length > 0) {
      activeGames.forEach(game => {
        console.log(`  ${game.away_team} @ ${game.home_team}: ${game.status}`);
      });
    }
    console.log(`Result: ${activeGames.length > 0 ? '✅ Has active games - priority updates' : '⚠️ No active games'}\n`);
    
    console.log('=== SUMMARY ===');
    console.log(`Polling Window: ${inWindow ? 'PASS' : 'FAIL - STOPS HERE'}`);
    console.log(`Active Weeks: ${(activeWeeks?.length || 0) > 0 ? 'PASS' : 'FAIL - EARLY RETURN'}`);
    console.log(`Games Status: ${allCompleted ? 'FAIL - ALL COMPLETED, STOPS' : 'PASS - NOT ALL COMPLETED'}`);
    console.log(`Active Games: ${activeGames.length > 0 ? 'HAS ACTIVE' : 'NO ACTIVE'}`);
    
    if (!inWindow) {
      console.log('\n🔴 LIVE UPDATES WOULD STOP: Outside polling window');
    } else if (!activeWeeks || activeWeeks.length === 0) {
      console.log('\n🟡 LIVE UPDATES WOULD SKIP: No active weeks (early return)');
    } else if (allCompleted) {
      console.log('\n🔴 LIVE UPDATES WOULD STOP: All games completed');
    } else {
      console.log('\n🟢 LIVE UPDATES WOULD CONTINUE');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkStopConditions();