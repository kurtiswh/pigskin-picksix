const { createClient } = require('@supabase/supabase-js');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const SUPABASE_URL = 'https://zgdaqbnpgrabbnljmiqy.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const CFBD_API_KEY = process.env.VITE_CFBD_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ANSI color codes for better visibility
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

async function fixWeek2Games() {
  console.log(`${colors.bright}${colors.cyan}====================================`);
  console.log('🏈 WEEK 2 GAME STATUS FIX UTILITY 🏈');
  console.log(`====================================${colors.reset}\n`);

  try {
    // Step 1: Get current CFBD data
    console.log(`${colors.yellow}📡 Fetching latest game data from CFBD API...${colors.reset}`);
    const response = await fetch(
      `https://api.collegefootballdata.com/scoreboard?year=2025&week=2&classification=fbs`,
      {
        headers: { 'Authorization': `Bearer ${CFBD_API_KEY}` }
      }
    );
    
    if (!response.ok) {
      throw new Error(`CFBD API error: ${response.status}`);
    }
    
    const cfbdGames = await response.json();
    console.log(`✅ Found ${cfbdGames.length} games in CFBD API\n`);

    // Step 2: Get our database games
    console.log(`${colors.yellow}📊 Loading Week 2 games from database...${colors.reset}`);
    const { data: dbGames, error: dbError } = await supabase
      .from('games')
      .select('*')
      .eq('season', 2025)
      .eq('week', 2)
      .order('kickoff_time');
    
    if (dbError) throw dbError;
    console.log(`✅ Found ${dbGames.length} games in database\n`);

    // Step 3: Match and update each game
    console.log(`${colors.bright}${colors.blue}🔄 PROCESSING GAME UPDATES${colors.reset}`);
    console.log('─'.repeat(50));
    
    let completedCount = 0;
    let inProgressCount = 0;
    let scheduledCount = 0;
    let errorCount = 0;

    for (const dbGame of dbGames) {
      // Find matching CFBD game
      const cfbdGame = cfbdGames.find(g => {
        const homeMatch = g.homeTeam?.name?.toLowerCase().includes(dbGame.home_team.toLowerCase()) ||
                         dbGame.home_team.toLowerCase().includes(g.homeTeam?.name?.toLowerCase() || '');
        const awayMatch = g.awayTeam?.name?.toLowerCase().includes(dbGame.away_team.toLowerCase()) ||
                         dbGame.away_team.toLowerCase().includes(g.awayTeam?.name?.toLowerCase() || '');
        return homeMatch && awayMatch;
      });

      if (!cfbdGame) {
        console.log(`${colors.red}❌ No CFBD match for: ${dbGame.away_team} @ ${dbGame.home_team}${colors.reset}`);
        errorCount++;
        continue;
      }

      const cfbdStatus = cfbdGame.status;
      const cfbdHomeScore = cfbdGame.homeTeam?.points || 0;
      const cfbdAwayScore = cfbdGame.awayTeam?.points || 0;
      
      console.log(`\n${colors.bright}${dbGame.away_team} @ ${dbGame.home_team}${colors.reset}`);
      console.log(`  Current: ${dbGame.status} (${dbGame.away_score || 0}-${dbGame.home_score || 0})`);
      console.log(`  CFBD: ${cfbdStatus} (${cfbdAwayScore}-${cfbdHomeScore})`);

      // Determine correct status
      let newStatus = cfbdStatus;
      if (cfbdStatus === 'final' || cfbdStatus === 'completed') {
        newStatus = 'completed';
        completedCount++;
      } else if (cfbdStatus === 'in_progress') {
        inProgressCount++;
      } else {
        newStatus = 'scheduled';
        scheduledCount++;
      }

      // Check if update needed
      const needsUpdate = 
        dbGame.status !== newStatus ||
        dbGame.home_score !== cfbdHomeScore ||
        dbGame.away_score !== cfbdAwayScore;

      if (!needsUpdate) {
        console.log(`  ${colors.green}✓ Already up to date${colors.reset}`);
        continue;
      }

      // Prepare update data
      let updateData = {
        home_score: cfbdHomeScore,
        away_score: cfbdAwayScore,
        updated_at: new Date().toISOString()
      };

      // Add period/clock for in-progress games
      if (cfbdGame.period) {
        updateData.game_period = cfbdGame.period;
        updateData.game_clock = cfbdGame.clock || '';
      }

      // Calculate winner for completed games
      if (newStatus === 'completed') {
        const homeMargin = cfbdHomeScore - cfbdAwayScore;
        const spread = dbGame.spread || 0;
        const adjustedMargin = homeMargin + spread;
        
        if (Math.abs(adjustedMargin) < 0.5) {
          updateData.winner_against_spread = 'push';
          updateData.margin_bonus = 0;
        } else if (adjustedMargin > 0) {
          updateData.winner_against_spread = dbGame.home_team;
          if (adjustedMargin >= 29) updateData.margin_bonus = 5;
          else if (adjustedMargin >= 20) updateData.margin_bonus = 3;
          else if (adjustedMargin >= 11) updateData.margin_bonus = 1;
          else updateData.margin_bonus = 0;
        } else {
          updateData.winner_against_spread = dbGame.away_team;
          const absMargin = Math.abs(adjustedMargin);
          if (absMargin >= 29) updateData.margin_bonus = 5;
          else if (absMargin >= 20) updateData.margin_bonus = 3;
          else if (absMargin >= 11) updateData.margin_bonus = 1;
          else updateData.margin_bonus = 0;
        }
        updateData.base_points = 20;
      }

      // Step 1: Update scores and calculations first
      console.log(`  ${colors.yellow}Updating scores and calculations...${colors.reset}`);
      const { error: scoreError } = await supabase
        .from('games')
        .update(updateData)
        .eq('id', dbGame.id);

      if (scoreError) {
        console.log(`  ${colors.red}❌ Score update failed: ${scoreError.message}${colors.reset}`);
        errorCount++;
        continue;
      }

      // Step 2: Try to update status separately (this might timeout but scores are saved)
      if (dbGame.status !== newStatus) {
        console.log(`  ${colors.yellow}Attempting status change: ${dbGame.status} → ${newStatus}${colors.reset}`);
        
        // Use a shorter timeout
        const statusPromise = supabase
          .from('games')
          .update({ status: newStatus })
          .eq('id', dbGame.id);
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Status update timeout')), 3000)
        );

        try {
          await Promise.race([statusPromise, timeoutPromise]);
          console.log(`  ${colors.green}✓ Status updated successfully${colors.reset}`);
        } catch (statusErr) {
          console.log(`  ${colors.yellow}⚠ Status update failed (scores still saved): ${statusErr.message}${colors.reset}`);
          // Continue - scores are still updated even if status fails
        }
      }

      // Step 3: Process picks for completed games (if status update succeeded)
      if (newStatus === 'completed' && updateData.winner_against_spread) {
        console.log(`  ${colors.cyan}Processing picks...${colors.reset}`);
        
        // Process regular picks
        const { data: picks } = await supabase
          .from('picks')
          .select('id, selected_team, is_lock')
          .eq('game_id', dbGame.id)
          .is('result', null);

        if (picks && picks.length > 0) {
          let processed = 0;
          for (const pick of picks) {
            const result = updateData.winner_against_spread === 'push' ? 'push' :
                         pick.selected_team === updateData.winner_against_spread ? 'win' : 'loss';
            const points = result === 'push' ? 10 :
                         result === 'win' ? (20 + (updateData.margin_bonus || 0) + 
                           (pick.is_lock ? (updateData.margin_bonus || 0) : 0)) : 0;
            
            await supabase
              .from('picks')
              .update({ result, points_earned: points })
              .eq('id', pick.id);
            processed++;
          }
          console.log(`  ${colors.green}✓ Processed ${processed} picks${colors.reset}`);
        }
      }
    }

    // Step 4: Summary
    console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(50)}${colors.reset}`);
    console.log(`${colors.bright}📊 UPDATE SUMMARY${colors.reset}`);
    console.log(`${colors.green}  Completed games: ${completedCount}${colors.reset}`);
    console.log(`${colors.yellow}  In-progress games: ${inProgressCount}${colors.reset}`);
    console.log(`${colors.blue}  Scheduled games: ${scheduledCount}${colors.reset}`);
    console.log(`${colors.red}  Errors: ${errorCount}${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(50)}${colors.reset}`);

    // Step 5: Show current database state
    console.log(`\n${colors.bright}📋 CURRENT DATABASE STATE${colors.reset}`);
    const { data: finalGames } = await supabase
      .from('games')
      .select('home_team, away_team, status, home_score, away_score, winner_against_spread')
      .eq('season', 2025)
      .eq('week', 2)
      .order('kickoff_time');

    finalGames?.forEach(g => {
      const statusColor = g.status === 'completed' ? colors.green :
                         g.status === 'in_progress' ? colors.yellow :
                         colors.blue;
      console.log(`  ${statusColor}${g.status.padEnd(12)}${colors.reset} ${g.away_team} @ ${g.home_team}: ${g.away_score || 0}-${g.home_score || 0}`);
    });

    console.log(`\n${colors.bright}${colors.green}✅ Week 2 games update complete!${colors.reset}`);
    console.log(`\n${colors.yellow}Note: If some games show wrong status, it may be due to database triggers.`);
    console.log(`Consider running migration 114 to remove problematic triggers.${colors.reset}`);

  } catch (error) {
    console.error(`\n${colors.red}❌ Fatal error: ${error.message}${colors.reset}`);
  }
}

// Run the fix
fixWeek2Games();