import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://zgdaqbnpgrabbnljmiqy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8'
);

async function updateNebraskaGame() {
  console.log('🔧 Updating Nebraska @ Cincinnati game to completed...');
  
  try {
    // First, let's check the current status
    const { data: currentGame, error: checkError } = await supabase
      .from('games')
      .select('*')
      .eq('season', 2025)
      .eq('week', 1)
      .eq('home_team', 'Cincinnati')
      .eq('away_team', 'Nebraska')
      .single();
    
    if (checkError) {
      console.error('❌ Error checking game:', checkError.message);
      return;
    }
    
    console.log('📊 Current game state:');
    console.log('  Status:', currentGame.status);
    console.log('  Score: Nebraska', currentGame.away_score, '- Cincinnati', currentGame.home_score);
    
    if (currentGame.status === 'completed') {
      console.log('✅ Game is already marked as completed!');
      return;
    }
    
    // Update the game status
    const { data: updatedGame, error: updateError } = await supabase
      .from('games')
      .update({ 
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', currentGame.id)
      .select()
      .single();
    
    if (updateError) {
      console.error('❌ Update failed:', updateError.message);
      console.error('Error code:', updateError.code);
      console.error('Error details:', updateError.details);
      
      if (updateError.code === '42804') {
        console.log('💡 This appears to be a database trigger issue with enum types');
        console.log('💡 A trigger may be trying to update picks with incorrect type casting');
      }
    } else {
      console.log('✅ Successfully updated game status!');
      console.log('  New status:', updatedGame.status);
      console.log('  Updated at:', updatedGame.updated_at);
      console.log('');
      console.log('🎯 This should trigger automatic:');
      console.log('  - Pick result calculations');
      console.log('  - Points awarded to winners');
      console.log('  - Season leaderboard updates');
      console.log('  - Weekly leaderboard updates');
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
  }
}

// Run the update
updateNebraskaGame().then(() => {
  console.log('🏁 Script completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Script error:', error);
  process.exit(1);
});