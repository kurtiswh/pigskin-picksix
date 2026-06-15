const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://zgdaqbnpgrabbnljmiqy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyEnhancement() {
  try {
    console.log('🚀 Applying Enhanced Live Updates Function');
    console.log('==========================================');
    
    // Read the enhancement migration
    const migrationPath = path.join(__dirname, 'database/migrations/116_enhance_live_updates_with_cfbd_api.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📁 Enhancement file loaded');
    console.log('💡 Note: Since we cannot execute complex SQL via RPC, please copy this content to Supabase SQL Editor:');
    console.log('================================================================================');
    console.log(migrationSQL);
    console.log('================================================================================');
    
    // Test the function to see if it was applied
    console.log('\n🧪 Testing if enhanced function exists...');
    
    const { data, error } = await supabase.rpc('scheduled_live_game_updates');
    
    if (error) {
      console.log('❌ Function test failed:', error.message);
      console.log('\n📋 MANUAL STEPS REQUIRED:');
      console.log('1. Copy the SQL content above');
      console.log('2. Go to Supabase Dashboard → SQL Editor'); 
      console.log('3. Paste and run the SQL');
      console.log('4. Test via Admin Dashboard → Scheduled Functions');
    } else {
      console.log('✅ Function executed successfully!');
      console.log('📊 Result:', data);
      
      if (data && data.games_updated > 0) {
        console.log('🎉 Enhanced function is working and updated games!');
      } else {
        console.log('💡 Function ran but no updates needed (games may already be current)');
      }
    }
    
  } catch (error) {
    console.error('❌ Enhancement application failed:', error.message);
  }
}

applyEnhancement();