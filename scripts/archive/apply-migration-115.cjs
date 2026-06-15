const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://zgdaqbnpgrabbnljmiqy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  try {
    console.log('🚀 Applying Migration 115: Complete Trigger Cleanup');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'database/migrations/115_complete_trigger_cleanup_simple_system.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📁 Migration file loaded, executing...');
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    });
    
    if (error) {
      console.error('❌ Migration failed:', error.message);
      console.error('Details:', error);
      
      // Try direct execution if RPC fails
      console.log('🔄 Trying direct execution...');
      const directResult = await supabase
        .from('_realtime_schema')
        .select('*')
        .limit(1);
      
      console.log('Direct connection test result:', directResult);
      return;
    }
    
    console.log('✅ Migration 115 applied successfully!');
    console.log('📊 Result:', data);
    
    // Test the new functions
    console.log('\n🧪 Testing new scheduled functions...');
    
    const functions = [
      'scheduled_live_game_updates',
      'scheduled_pick_processing', 
      'scheduled_game_statistics',
      'scheduled_leaderboard_refresh'
    ];
    
    for (const funcName of functions) {
      try {
        console.log(`  Testing ${funcName}()...`);
        const { data: testData, error: testError } = await supabase.rpc(funcName);
        
        if (testError) {
          console.log(`    ⚠️ ${funcName}: ${testError.message}`);
        } else {
          console.log(`    ✅ ${funcName}: Working (${JSON.stringify(testData)})`);
        }
      } catch (testErr) {
        console.log(`    ⚠️ ${funcName}: ${testErr.message}`);
      }
    }
    
    console.log('\n🎉 Migration and function testing complete!');
    
  } catch (err) {
    console.error('❌ Migration application failed:', err.message);
    console.error('Full error:', err);
  }
}

applyMigration();