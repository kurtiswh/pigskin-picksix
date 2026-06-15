// BROWSER CONSOLE SCRIPT: Retry Failed Week 2 Games
// Run this after applying the SQL trigger removal script

console.log('🔄 Retrying failed Week 2 games...');

// Import the live update service
import('/src/services/liveUpdateService.js').then(async ({ liveUpdateService }) => {
  console.log('✅ Live update service loaded');
  
  try {
    // Stop current polling to avoid conflicts
    liveUpdateService.stopPolling();
    
    // Wait a moment then retry
    setTimeout(async () => {
      console.log('🚀 Retrying manual update for Week 2...');
      
      const result = await liveUpdateService.manualUpdate(2025, 2);
      
      console.log('✅ Retry update completed!');
      console.log('📊 Results:');
      console.log('  - Games updated:', result.gamesUpdated);
      console.log('  - Picks processed:', result.picksProcessed);
      console.log('  - Success:', result.success);
      
      if (result.errors && result.errors.length > 0) {
        console.log('⚠️ Remaining errors:');
        result.errors.forEach(err => console.log('  -', err));
      } else {
        console.log('🎉 All games updated successfully!');
      }
      
      // Restart polling
      console.log('⏰ Restarting automatic polling...');
      await liveUpdateService.startSmartPolling();
      
    }, 2000);
    
  } catch (error) {
    console.error('❌ Retry failed:', error.message);
  }
  
}).catch(error => {
  console.error('❌ Failed to load live update service:', error.message);
});