const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zgdaqbnpgrabbnljmiqy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function updateGameStatus() {
  const gameId = '81ae6301-304f-4860-a890-ac3aacf556ef';
  
  console.log('🎯 Attempting to update game status to completed...');
  console.log('Game ID:', gameId);
  
  try {
    // First try to get current game details
    console.log('\n1️⃣ Fetching current game details...');
    const { data: currentGame, error: fetchError } = await supabase
      .from('games')
      .select('id, home_team, away_team, status, home_score, away_score, week, season')
      .eq('id', gameId)
      .single();
    
    if (fetchError) {
      console.error('❌ Error fetching game:', fetchError.message);
      return false;
    }
    
    console.log('✅ Current game details:');
    console.log('  Matchup:', currentGame.away_team, '@', currentGame.home_team);
    console.log('  Score:', currentGame.away_team, currentGame.away_score, '-', currentGame.home_score, currentGame.home_team);
    console.log('  Current status:', currentGame.status);
    console.log('  Week:', currentGame.week, 'Season:', currentGame.season);
    
    if (currentGame.status === 'completed') {
      console.log('ℹ️ Game is already marked as completed!');
      return true;
    }
    
    // Attempt the update
    console.log('\n2️⃣ Updating game status to completed...');
    const { data: updatedGame, error: updateError } = await supabase
      .from('games')
      .update({ status: 'completed' })
      .eq('id', gameId)
      .select('id, home_team, away_team, status, home_score, away_score');
    
    if (updateError) {
      console.error('❌ Error updating game status:', updateError.message);
      console.error('Error code:', updateError.code);
      console.error('Error details:', JSON.stringify(updateError, null, 2));
      
      if (updateError.code === '42703') {
        console.log('\n💡 Column not found error - likely missing home_covered column');
        console.log('💡 This suggests a database trigger is trying to access a non-existent column');
        console.log('💡 You may need to run a migration to add missing columns or fix triggers');
      } else if (updateError.code === '42501') {
        console.log('\n💡 Permission denied - RLS policy may prevent anonymous updates to games');
        console.log('💡 Admin authentication may be required for game status updates');
      }
      
      return false;
    }
    
    console.log('✅ Game status updated successfully!');
    if (updatedGame && updatedGame.length > 0) {
      console.log('📋 Updated game details:');
      console.log('  Matchup:', updatedGame[0].away_team, '@', updatedGame[0].home_team);
      console.log('  Final Score:', updatedGame[0].away_team, updatedGame[0].away_score, '-', updatedGame[0].home_score, updatedGame[0].home_team);
      console.log('  Status:', updatedGame[0].status);
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Exception occurred:', error.message);
    return false;
  }
}

// Run the update
updateGameStatus().then(success => {
  if (success) {
    console.log('\n🎉 Game status update completed successfully!');
  } else {
    console.log('\n❌ Game status update failed. Manual intervention may be required.');
  }
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('\n💥 Fatal error:', error.message);
  process.exit(1);
});