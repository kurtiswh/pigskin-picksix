// Simple script to restart the live update service
console.log('🚀 Restarting Live Update Service for Week 2...\n');

// This script should be run in browser console where the live update service is available
const script = `
// Access the live update service from the browser
if (window.liveUpdateService) {
  console.log('🔄 Stopping current live updates...');
  window.liveUpdateService.stopPolling();
  
  setTimeout(() => {
    console.log('🚀 Starting live updates for Week 2...');
    window.liveUpdateService.manualUpdate(2025, 2).then(result => {
      console.log('✅ Manual update result:', result);
      console.log('  Games updated:', result.gamesUpdated);
      console.log('  Picks processed:', result.picksProcessed);
      
      // Start automatic polling
      console.log('⏰ Starting smart polling...');
      window.liveUpdateService.startSmartPolling();
    });
  }, 1000);
} else {
  console.error('❌ Live update service not found. Make sure you are on a page that loads it.');
}
`;

console.log('🔧 To restart the live update service:');
console.log('1. Open the Pigskin Pick Six app in your browser');
console.log('2. Open Developer Tools (F12)');
console.log('3. Go to the Console tab');
console.log('4. Paste and run this code:\n');
console.log('─'.repeat(50));
console.log(script);
console.log('─'.repeat(50));
console.log('\n📝 This will:');
console.log('   • Stop current live updates');
console.log('   • Manually update Week 2 games');
console.log('   • Restart automatic polling');
console.log('\n✨ The games should update within a few seconds!');