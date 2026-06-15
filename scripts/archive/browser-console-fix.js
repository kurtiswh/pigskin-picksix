// BROWSER CONSOLE SCRIPT: Week 2 Live Update Fix
// Copy and paste this entire script into your browser console

console.log('🚀 Starting Week 2 Live Update Fix...');

// Import the live update service dynamically (same way the app does it)
import('/src/services/liveUpdateService.js').then(({ liveUpdateService }) => {
  console.log('✅ Live update service loaded');
  
  // First, stop any current polling
  console.log('🔄 Stopping current live updates...');
  liveUpdateService.stopPolling();
  
  // Wait a moment, then start the manual update
  setTimeout(async () => {
    console.log('🚀 Starting manual update for Week 2...');
    
    try {
      const result = await liveUpdateService.manualUpdate(2025, 2);
      
      console.log('✅ Manual update completed!');
      console.log('📊 Results:');
      console.log('  - Games updated:', result.gamesUpdated);
      console.log('  - Picks processed:', result.picksProcessed);
      console.log('  - Success:', result.success);
      
      if (result.errors && result.errors.length > 0) {
        console.log('⚠️ Errors encountered:');
        result.errors.forEach(err => console.log('  -', err));
      }
      
      // Start automatic polling for future updates
      console.log('⏰ Starting automatic polling...');
      await liveUpdateService.startSmartPolling();
      console.log('🎉 Live updates are now active!');
      
      // Check status
      setTimeout(() => {
        const status = liveUpdateService.getStatus();
        console.log('📈 Live Update Status:');
        console.log('  - Running:', status.isRunning);
        console.log('  - Total updates:', status.totalUpdates);
        console.log('  - Last update:', status.lastUpdate);
        
        if (status.lastResult) {
          console.log('  - Last result games updated:', status.lastResult.gamesUpdated);
        }
      }, 2000);
      
    } catch (error) {
      console.error('❌ Manual update failed:', error.message);
      console.log('💡 Try refreshing the page and running the script again');
    }
  }, 1000);
  
}).catch(error => {
  console.error('❌ Failed to load live update service:', error.message);
  console.log('💡 Make sure you are on the main app page and try:');
  console.log('   1. Refresh the page');
  console.log('   2. Navigate to Admin Dashboard');
  console.log('   3. Run this script again');
});