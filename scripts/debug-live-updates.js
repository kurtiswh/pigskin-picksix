/**
 * Debug script for live game updates and completion system
 * Use this to monitor and troubleshoot the game completion process
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co',
  process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8'
);

async function debugLiveUpdates() {
  console.log('🔍 LIVE UPDATE SYSTEM DIAGNOSTIC');
  console.log('================================');
  console.log('This tool helps debug game completion issues\n');
  
  try {
    // Step 1: Database connection test
    console.log('1️⃣ Testing database connection...');
    const { data: testData, error: testError } = await supabase
      .from('games')
      .select('count')
      .limit(1);
    
    if (testError) {
      console.error('❌ Database connection failed:', testError.message);
      return;
    }
    console.log('✅ Database connection successful\n');
    
    // Step 2: Current game status analysis
    console.log('2️⃣ Analyzing current game status...');
    const { data: games, error } = await supabase
      .from('games')
      .select('*')
      .eq('season', 2025)
      .eq('week', 1)
      .order('kickoff_time');
    
    if (error) {
      throw new Error(`Game query failed: ${error.message}`);
    }
    
    console.log(`Found ${games?.length || 0} games for 2025 Week 1\n`);
    
    // Categorize games
    const scheduled = games?.filter(g => g.status === 'scheduled') || [];
    const inProgress = games?.filter(g => g.status === 'in_progress' || g.status === 'live') || [];
    const completed = games?.filter(g => g.status === 'completed') || [];
    const withScores = games?.filter(g => g.home_score !== null && g.away_score !== null) || [];
    const shouldBeCompleted = withScores.filter(g => g.status !== 'completed');
    
    console.log('📊 Game Status Summary:');
    console.log(`   Scheduled: ${scheduled.length}`);
    console.log(`   In Progress: ${inProgress.length}`);
    console.log(`   Completed: ${completed.length}`);
    console.log(`   Games with scores: ${withScores.length}`);
    console.log(`   Should be completed: ${shouldBeCompleted.length}\n`);
    
    // Step 3: Issue identification
    if (shouldBeCompleted.length > 0) {
      console.log('🚨 COMPLETION ISSUES DETECTED:');
      shouldBeCompleted.forEach(game => {
        console.log(`   ${game.away_team} @ ${game.home_team}:`);
        console.log(`     Status: ${game.status} (should be 'completed')`);
        console.log(`     Scores: ${game.away_score}-${game.home_score}`);
        console.log(`     Winner ATS: ${game.winner_against_spread || 'Not calculated'}`);
        console.log(`     API Completed: ${game.api_completed || false}`);
        console.log('');
      });
    } else {
      console.log('✅ No completion issues detected\n');
    }
    
    // Step 4: CollegeFootballData API test
    console.log('3️⃣ Testing CollegeFootballData API...');
    try {
      const apiKey = process.env.VITE_CFBD_API_KEY;
      if (!apiKey) {
        console.log('⚠️  CFBD API key not found - set VITE_CFBD_API_KEY');
      } else {
        const response = await fetch(
          `https://api.collegefootballdata.com/scoreboard?year=2025&week=1&classification=fbs`,
          {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          }
        );
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const apiGames = await response.json();
        console.log(`✅ CFBD API successful - ${apiGames.length} games returned`);
        
        // Check for completed games in API
        const completedApiGames = apiGames.filter(g => 
          g.status === 'completed' || g.status === 'final'
        );
        console.log(`   API shows ${completedApiGames.length} completed games`);
        
        // Match API games to database games
        let matchedGames = 0;
        let completionMismatches = 0;
        
        apiGames.forEach(apiGame => {
          const dbGame = games?.find(g => {
            const homeMatch = g.home_team.toLowerCase().includes(apiGame.homeTeam.name.toLowerCase().split(' ')[0]);
            const awayMatch = g.away_team.toLowerCase().includes(apiGame.awayTeam.name.toLowerCase().split(' ')[0]);
            return homeMatch && awayMatch;
          });
          
          if (dbGame) {
            matchedGames++;
            const apiCompleted = apiGame.status === 'completed' || apiGame.status === 'final';
            const dbCompleted = dbGame.status === 'completed';
            
            if (apiCompleted && !dbCompleted) {
              console.log(`   🚨 MISMATCH: ${dbGame.away_team} @ ${dbGame.home_team}`);
              console.log(`     API: ${apiGame.status} (completed: ${apiCompleted})`);
              console.log(`     DB: ${dbGame.status} (completed: ${dbCompleted})`);
              completionMismatches++;
            }
          }
        });
        
        console.log(`   Matched ${matchedGames} API games to database`);
        if (completionMismatches > 0) {
          console.log(`   ⚠️  Found ${completionMismatches} completion mismatches\n`);
        } else {
          console.log('   ✅ No completion mismatches found\n');
        }
      }
    } catch (apiError) {
      console.log(`❌ CFBD API test failed: ${apiError.message}\n`);
    }
    
    // Step 5: Trigger functionality test
    console.log('4️⃣ Testing database trigger functionality...');
    const testGame = completed[0]; // Use a completed game for safe testing
    
    if (testGame) {
      console.log(`Testing with: ${testGame.away_team} @ ${testGame.home_team}`);
      
      const startTime = Date.now();
      const { error: triggerError } = await supabase
        .from('games')
        .update({ 
          updated_at: new Date().toISOString()
        })
        .eq('id', testGame.id);
      
      const duration = Date.now() - startTime;
      
      if (triggerError) {
        console.log(`❌ Trigger test failed: ${triggerError.message}`);
        if (triggerError.message.includes('timeout')) {
          console.log('🚨 DATABASE TIMEOUT - Triggers may be causing performance issues');
        }
      } else {
        console.log(`✅ Trigger test passed (${duration}ms)`);
        if (duration > 5000) {
          console.log('⚠️  Slow response time - may indicate trigger performance issues');
        }
      }
    } else {
      console.log('No completed games available for testing');
    }
    
    // Step 6: Recommendations
    console.log('\n📋 DIAGNOSTIC SUMMARY & RECOMMENDATIONS:');
    console.log('======================================');
    
    if (shouldBeCompleted.length > 0) {
      console.log('🚨 ACTION REQUIRED: Games with scores are not marked completed');
      console.log('   Solutions:');
      console.log('   1. Apply Migration 101 if not already applied');
      console.log('   2. Check if completion-only triggers are installed');
      console.log('   3. Manually run live update service');
      console.log('   4. Check database trigger logs for errors');
    }
    
    console.log('\n🔧 Testing Commands:');
    console.log('   Run Migration 101 test: npm run test:migration-101');
    console.log('   Manual live update: console -> LiveUpdateService.getInstance().manualUpdate(2025, 1)');
    console.log('   Check trigger status: SELECT * FROM information_schema.triggers WHERE event_object_table = \'games\';');
    
    console.log('\n✅ Diagnostic complete');
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error.message);
  }
}

// Allow running this script directly
if (require.main === module) {
  debugLiveUpdates().catch(console.error);
}

module.exports = { debugLiveUpdates };