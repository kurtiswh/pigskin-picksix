const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://zgdaqbnpgrabbmljmiuy.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGxtaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8'
);

async function debugElizabethPicks() {
  console.log('=== Debugging Elizabeth Kreeb Picks Issue ===');
  
  // Find Elizabeth's user ID
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, display_name')
    .ilike('display_name', '%Elizabeth%Kreeb%');
  
  if (userError) {
    console.error('Error finding user:', userError);
    return;
  }
  
  if (!users || users.length === 0) {
    console.log('No Elizabeth Kreeb found');
    return;
  }
  
  const elizabethId = users[0].id;
  console.log(`Found Elizabeth Kreeb: ${elizabethId}`);
  
  // Check authenticated picks
  const { data: authPicks } = await supabase
    .from('picks')
    .select('week, season, points_earned, submitted, show_on_leaderboard')
    .eq('user_id', elizabethId)
    .eq('season', 2025)
    .order('week');
  
  console.log('\n=== Authenticated Picks for 2025 ===');
  authPicks?.forEach(pick => {
    console.log(`Week ${pick.week}: ${pick.points_earned} points (submitted: ${pick.submitted}, show: ${pick.show_on_leaderboard})`);
  });
  
  // Check anonymous picks  
  const { data: anonPicks } = await supabase
    .from('anonymous_picks')
    .select('week, season, points_earned, show_on_leaderboard')
    .eq('assigned_user_id', elizabethId)
    .eq('season', 2025)
    .order('week');
  
  console.log('\n=== Anonymous Picks for 2025 ===');
  anonPicks?.forEach(pick => {
    console.log(`Week ${pick.week}: ${pick.points_earned} points (show: ${pick.show_on_leaderboard})`);
  });
  
  // Check what the current leaderboard views show
  console.log('\n=== Current Weekly Leaderboard Results ===');
  const { data: weeklyData } = await supabase
    .from('weekly_leaderboard')
    .select('*')
    .eq('user_id', elizabethId)
    .eq('season', 2025)
    .order('week');
  
  weeklyData?.forEach(entry => {
    console.log(`Week ${entry.week}: ${entry.total_points} points (source: ${entry.pick_source})`);
  });
  
  console.log('\n=== Current Season Leaderboard Result ===');
  const { data: seasonData } = await supabase
    .from('season_leaderboard')
    .select('*')
    .eq('user_id', elizabethId)
    .eq('season', 2025);
  
  seasonData?.forEach(entry => {
    console.log(`Season: ${entry.total_points} points (source: ${entry.pick_source})`);
  });
  
  // Show the problem: authenticated picks exclude anonymous picks
  const authWeeks = (authPicks || []).filter(p => p.submitted && p.show_on_leaderboard).map(p => p.week);
  const anonWeeks = (anonPicks || []).filter(p => p.show_on_leaderboard).map(p => p.week);
  
  console.log('\n=== Analysis ===');
  console.log('Auth weeks (submitted & show):', authWeeks);
  console.log('Anon weeks (show):', anonWeeks);
  console.log('Non-overlapping weeks where both could show:', anonWeeks.filter(w => !authWeeks.includes(w)));
  console.log('Overlapping weeks (anon excluded by current logic):', anonWeeks.filter(w => authWeeks.includes(w)));
}

debugElizabethPicks().catch(console.error);