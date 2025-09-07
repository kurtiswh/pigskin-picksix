const { createClient } = require('@supabase/supabase-js');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const SUPABASE_URL = 'https://zgdaqbnpgrabbnljmiqy.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const CFBD_API_KEY = process.env.VITE_CFBD_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function manualUpdateWeek2() {
  try {
    console.log('🚀 Starting manual update for Week 2 games...\n');
    
    // Get CFBD API data
    const response = await fetch(
      `https://api.collegefootballdata.com/scoreboard?year=2025&week=2&classification=fbs`,
      {
        headers: { 'Authorization': `Bearer ${CFBD_API_KEY}` }
      }
    );
    
    if (!response.ok) {
      throw new Error(`CFBD API error: ${response.status}`);
    }
    
    const scoreboardData = await response.json();
    console.log(`📡 CFBD API returned ${scoreboardData.length} games\n`);
    
    // Get our Week 2 games
    const { data: dbGames, error: dbError } = await supabase
      .from('games')
      .select('*')
      .eq('season', 2025)
      .eq('week', 2)
      .order('kickoff_time');
    
    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`);
    }
    
    console.log(`📊 Found ${dbGames.length} Week 2 games in database\n`);
    
    // Enhanced matching function
    const findApiMatch = (dbGame, apiGames) => {
      return apiGames.find(apiGame => {
        const homeMatch = 
          apiGame.homeTeam?.name?.toLowerCase().includes(dbGame.home_team.toLowerCase()) ||
          dbGame.home_team.toLowerCase().includes(apiGame.homeTeam?.name?.toLowerCase() || '');
        const awayMatch = 
          apiGame.awayTeam?.name?.toLowerCase().includes(dbGame.away_team.toLowerCase()) ||
          dbGame.away_team.toLowerCase().includes(apiGame.awayTeam?.name?.toLowerCase() || '');
        return homeMatch && awayMatch;
      });
    };
    
    let updatedCount = 0;
    let errorCount = 0;
    
    for (const dbGame of dbGames) {
      const apiGame = findApiMatch(dbGame, scoreboardData);
      
      if (!apiGame) {
        console.log(`❌ No API match for: ${dbGame.away_team} @ ${dbGame.home_team}`);
        continue;
      }
      
      console.log(`\n🎯 Processing: ${dbGame.away_team} @ ${dbGame.home_team}`);
      console.log(`   DB Status: ${dbGame.status}`);
      console.log(`   API Status: ${apiGame.status}`);
      console.log(`   API Score: ${apiGame.awayTeam?.points || 0} - ${apiGame.homeTeam?.points || 0}`);
      
      // Determine if update is needed
      const needsUpdate = 
        dbGame.status !== apiGame.status ||
        dbGame.home_score !== (apiGame.homeTeam?.points || 0) ||
        dbGame.away_score !== (apiGame.awayTeam?.points || 0);
      
      if (!needsUpdate) {
        console.log(`   ✅ Already up to date`);
        continue;
      }
      
      // Calculate winner if game is completed
      let updateData = {
        status: apiGame.status,
        home_score: apiGame.homeTeam?.points || 0,
        away_score: apiGame.awayTeam?.points || 0,
        updated_at: new Date().toISOString()
      };
      
      if (apiGame.status === 'completed' || apiGame.status === 'final') {
        updateData.status = 'completed';
        
        // Calculate winner against spread
        const homeMargin = updateData.home_score - updateData.away_score;
        const spread = dbGame.spread || 0;
        const adjustedMargin = homeMargin + spread;
        
        if (Math.abs(adjustedMargin) < 0.5) {
          updateData.winner_against_spread = 'push';
          updateData.margin_bonus = 0;
        } else if (adjustedMargin > 0) {
          updateData.winner_against_spread = dbGame.home_team;
          // Calculate margin bonus
          if (adjustedMargin >= 29) updateData.margin_bonus = 5;
          else if (adjustedMargin >= 20) updateData.margin_bonus = 3;
          else if (adjustedMargin >= 11) updateData.margin_bonus = 1;
          else updateData.margin_bonus = 0;
        } else {
          updateData.winner_against_spread = dbGame.away_team;
          // Calculate margin bonus
          const absMargin = Math.abs(adjustedMargin);
          if (absMargin >= 29) updateData.margin_bonus = 5;
          else if (absMargin >= 20) updateData.margin_bonus = 3;
          else if (absMargin >= 11) updateData.margin_bonus = 1;
          else updateData.margin_bonus = 0;
        }
        
        updateData.base_points = 20;
        console.log(`   📊 Winner ATS: ${updateData.winner_against_spread}, Bonus: ${updateData.margin_bonus}`);
      }
      
      // Add period and clock for in-progress games
      if (apiGame.period) {
        updateData.game_period = apiGame.period;
        updateData.game_clock = apiGame.clock || '';
        updateData.api_period = apiGame.period;
        updateData.api_clock = apiGame.clock || '';
      }
      
      // Update the game
      console.log(`   🔄 Updating game...`);
      const { error: updateError } = await supabase
        .from('games')
        .update(updateData)
        .eq('id', dbGame.id);
      
      if (updateError) {
        console.error(`   ❌ Update failed: ${updateError.message}`);
        errorCount++;
      } else {
        console.log(`   ✅ Game updated successfully!`);
        updatedCount++;
        
        // If game is completed, process picks
        if (updateData.status === 'completed' && updateData.winner_against_spread) {
          console.log(`   🎯 Processing picks for completed game...`);
          
          // Process regular picks
          const { data: picks, error: picksError } = await supabase
            .from('picks')
            .select('id, selected_team, is_lock')
            .eq('game_id', dbGame.id)
            .is('result', null);
          
          if (!picksError && picks && picks.length > 0) {
            let picksUpdated = 0;
            for (const pick of picks) {
              const result = updateData.winner_against_spread === 'push' ? 'push' :
                           pick.selected_team === updateData.winner_against_spread ? 'win' : 'loss';
              const points = result === 'push' ? 10 :
                           result === 'win' ? (20 + updateData.margin_bonus + (pick.is_lock ? updateData.margin_bonus : 0)) : 0;
              
              const { error } = await supabase
                .from('picks')
                .update({ result, points_earned: points })
                .eq('id', pick.id);
              
              if (!error) picksUpdated++;
            }
            console.log(`   ✅ Updated ${picksUpdated}/${picks.length} picks`);
          }
          
          // Process anonymous picks
          const { data: anonPicks, error: anonError } = await supabase
            .from('anonymous_picks')
            .select('id, selected_team, is_lock')
            .eq('game_id', dbGame.id)
            .is('result', null);
          
          if (!anonError && anonPicks && anonPicks.length > 0) {
            let anonUpdated = 0;
            for (const pick of anonPicks) {
              const result = updateData.winner_against_spread === 'push' ? 'push' :
                           pick.selected_team === updateData.winner_against_spread ? 'win' : 'loss';
              const points = result === 'push' ? 10 :
                           result === 'win' ? (20 + updateData.margin_bonus + (pick.is_lock ? updateData.margin_bonus : 0)) : 0;
              
              const { error } = await supabase
                .from('anonymous_picks')
                .update({ result, points_earned: points })
                .eq('id', pick.id);
              
              if (!error) anonUpdated++;
            }
            console.log(`   ✅ Updated ${anonUpdated}/${anonPicks.length} anonymous picks`);
          }
        }
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log(`✅ Update complete!`);
    console.log(`   Games updated: ${updatedCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('❌ Update failed:', error.message);
  }
}

// Run the update
manualUpdateWeek2();