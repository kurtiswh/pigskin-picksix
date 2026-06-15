const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkArmyKansasStateGame() {
  try {
    console.log('🔍 Checking Army vs Kansas State game...\n');
    
    // Find the Army vs Kansas State game
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .or('and(home_team.ilike.%Army%,away_team.ilike.%Kansas State%),and(home_team.ilike.%Kansas State%,away_team.ilike.%Army%)')
      .eq('season', 2024)
      .order('week', { ascending: false })
      .limit(1);
    
    if (gamesError) throw gamesError;
    
    if (!games || games.length === 0) {
      console.log('No Army vs Kansas State game found');
      return;
    }
    
    const game = games[0];
    console.log('Game Details:');
    console.log(`  ID: ${game.id}`);
    console.log(`  Week: ${game.week}`);
    console.log(`  ${game.away_team} @ ${game.home_team}`);
    console.log(`  Score: ${game.away_score} - ${game.home_score}`);
    console.log(`  Spread: ${game.spread} (${game.spread < 0 ? game.home_team : game.away_team} favored)`);
    console.log(`  Status: ${game.status}\n`);
    
    // Calculate who covered the spread
    const actualMargin = game.home_score - game.away_score;
    const spreadCovered = actualMargin > Math.abs(game.spread);
    
    console.log('Spread Analysis:');
    console.log(`  Actual margin: ${actualMargin} (${game.home_team} by ${Math.abs(actualMargin)})`);
    console.log(`  Spread requirement: ${game.home_team} needed to win by more than ${Math.abs(game.spread)}`);
    console.log(`  Result: ${spreadCovered ? game.home_team : game.away_team} covered the spread`);
    console.log(`  Cover margin: ${Math.abs(actualMargin - Math.abs(game.spread))} points\n`);
    
    // Get all picks for this game
    const { data: picks, error: picksError } = await supabase
      .from('picks')
      .select('*, users(email, display_name)')
      .eq('game_id', game.id)
      .order('points_earned', { ascending: false });
    
    if (picksError) throw picksError;
    
    console.log(`Found ${picks?.length || 0} picks for this game\n`);
    
    // Analyze picks
    const armyPicks = picks?.filter(p => p.selected_team.includes('Army')) || [];
    const kstatePicks = picks?.filter(p => p.selected_team.includes('Kansas State')) || [];
    
    console.log('Pick Distribution:');
    console.log(`  Army picks: ${armyPicks.length}`);
    console.log(`  Kansas State picks: ${kstatePicks.length}\n`);
    
    // Check for bonus points based on cover margin
    const coverMargin = Math.abs(actualMargin - Math.abs(game.spread));
    let expectedBonus = 0;
    if (coverMargin >= 29) {
      expectedBonus = 5;
    } else if (coverMargin >= 20) {
      expectedBonus = 3;
    } else if (coverMargin >= 11) {
      expectedBonus = 1;
    }
    
    console.log('Expected Points Calculation:');
    console.log(`  Cover margin: ${coverMargin} points`);
    console.log(`  Expected bonus: ${expectedBonus} points`);
    console.log(`  Expected total for winners: ${20 + expectedBonus} points`);
    console.log(`  Expected total for lock winners: ${20 + (expectedBonus * 2)} points\n`);
    
    // Check actual points awarded
    if (armyPicks.length > 0) {
      console.log('Army Picks Analysis:');
      const uniquePoints = [...new Set(armyPicks.map(p => p.points_earned))];
      uniquePoints.forEach(points => {
        const count = armyPicks.filter(p => p.points_earned === points).length;
        const lockCount = armyPicks.filter(p => p.points_earned === points && p.is_lock).length;
        console.log(`  ${points} points: ${count} picks (${lockCount} locks)`);
      });
      
      // Check if any Army picks are missing bonus points
      const regularWinners = armyPicks.filter(p => !p.is_lock && p.result === 'win');
      const lockWinners = armyPicks.filter(p => p.is_lock && p.result === 'win');
      
      if (regularWinners.length > 0) {
        const expectedRegular = 20 + expectedBonus;
        const actualRegular = regularWinners[0]?.points_earned || 0;
        if (actualRegular !== expectedRegular) {
          console.log(`\n⚠️  ISSUE DETECTED: Regular Army picks got ${actualRegular} points, expected ${expectedRegular}`);
        }
      }
      
      if (lockWinners.length > 0) {
        const expectedLock = 20 + (expectedBonus * 2);
        const actualLock = lockWinners[0]?.points_earned || 0;
        if (actualLock !== expectedLock) {
          console.log(`\n⚠️  ISSUE DETECTED: Lock Army picks got ${actualLock} points, expected ${expectedLock}`);
        }
      }
    }
    
    // Let's manually calculate what the points should be
    console.log('\n📊 Manual Calculation:');
    console.log(`  Game: ${game.away_team} ${game.away_score} @ ${game.home_team} ${game.home_score}`);
    console.log(`  Spread: ${game.spread}`);
    
    // Determine who covered
    const homeTeam = game.home_team;
    const awayTeam = game.away_team;
    const homeScore = game.home_score;
    const awayScore = game.away_score;
    const spread = game.spread;
    
    // Army appears to be the away team based on the image
    if (awayTeam.includes('Army')) {
      console.log(`\n  Army was the away team (+${Math.abs(spread)} underdog)`);
      console.log(`  Final: Army ${awayScore}, ${homeTeam} ${homeScore}`);
      console.log(`  Army won by ${awayScore - homeScore} points`);
      console.log(`  Army covered the spread by ${(awayScore - homeScore) + Math.abs(spread)} points`);
      
      const coverBy = (awayScore - homeScore) + Math.abs(spread);
      let bonus = 0;
      if (coverBy >= 29) bonus = 5;
      else if (coverBy >= 20) bonus = 3;
      else if (coverBy >= 11) bonus = 1;
      
      console.log(`  Bonus points earned: ${bonus} (covered by ${coverBy})`);
      console.log(`  Total points for regular pick: ${20 + bonus}`);
      console.log(`  Total points for lock pick: ${20 + (bonus * 2)}`);
    } else if (homeTeam.includes('Army')) {
      console.log(`\n  Army was the home team`);
      console.log(`  Final: ${awayTeam} ${awayScore}, Army ${homeScore}`);
      
      if (spread < 0) {
        // Army was favored
        console.log(`  Army was favored by ${Math.abs(spread)}`);
        const wonBy = homeScore - awayScore;
        console.log(`  Army won by ${wonBy} points`);
        
        if (wonBy > Math.abs(spread)) {
          const coverBy = wonBy - Math.abs(spread);
          console.log(`  Army covered the spread by ${coverBy} points`);
          
          let bonus = 0;
          if (coverBy >= 29) bonus = 5;
          else if (coverBy >= 20) bonus = 3;
          else if (coverBy >= 11) bonus = 1;
          
          console.log(`  Bonus points earned: ${bonus}`);
          console.log(`  Total points for regular pick: ${20 + bonus}`);
          console.log(`  Total points for lock pick: ${20 + (bonus * 2)}`);
        } else {
          console.log(`  Army did NOT cover the spread`);
          console.log(`  Points earned: 0`);
        }
      } else {
        // Army was underdog
        console.log(`  Army was ${spread} point underdog`);
        const wonBy = homeScore - awayScore;
        console.log(`  Army won by ${wonBy} points`);
        const coverBy = wonBy + spread;
        console.log(`  Army covered the spread by ${coverBy} points`);
        
        let bonus = 0;
        if (coverBy >= 29) bonus = 5;
        else if (coverBy >= 20) bonus = 3;
        else if (coverBy >= 11) bonus = 1;
        
        console.log(`  Bonus points earned: ${bonus}`);
        console.log(`  Total points for regular pick: ${20 + bonus}`);
        console.log(`  Total points for lock pick: ${20 + (bonus * 2)}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkArmyKansasStateGame();