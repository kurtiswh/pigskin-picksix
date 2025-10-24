const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function fixWeekSettings() {
  console.log('🔧 Fixing Week Settings...\n')
  
  try {
    // Step 1: Set all old weeks (1-4) to picks_open = false
    console.log('📝 Step 1: Closing picks for completed weeks (1-4)...')
    
    for (let week = 1; week <= 4; week++) {
      const { error } = await supabase
        .from('week_settings')
        .update({ 
          picks_open: false,
          updated_at: new Date().toISOString()
        })
        .eq('season', 2025)
        .eq('week', week)
      
      if (error) {
        console.error(`❌ Error updating week ${week}:`, error.message)
      } else {
        console.log(`✅ Week ${week}: Set picks_open = false`)
      }
    }
    
    // Step 2: Set Week 5 to picks_open = true (active week)
    console.log('\n📝 Step 2: Setting Week 5 as active...')
    
    const { error: week5Error } = await supabase
      .from('week_settings')
      .update({ 
        picks_open: true,
        games_locked: true, // Keep games locked as they were
        updated_at: new Date().toISOString()
      })
      .eq('season', 2025)
      .eq('week', 5)
    
    if (week5Error) {
      console.error('❌ Error updating week 5:', week5Error.message)
    } else {
      console.log('✅ Week 5: Set picks_open = true (active week)')
    }
    
    // Step 3: Verify the changes
    console.log('\n📊 Verifying changes...')
    const { data: updatedWeeks, error: verifyError } = await supabase
      .from('week_settings')
      .select('week, picks_open, games_locked')
      .eq('season', 2025)
      .order('week')
    
    if (verifyError) {
      console.error('❌ Error verifying:', verifyError.message)
    } else {
      console.log('\nUpdated Week Settings:')
      console.table(updatedWeeks)
      
      const activeWeeks = updatedWeeks.filter(w => w.picks_open)
      console.log(`\n✅ Active weeks: ${activeWeeks.map(w => w.week).join(', ')}`)
      
      if (activeWeeks.length === 1 && activeWeeks[0].week === 5) {
        console.log('🎉 SUCCESS! Week 5 is now the only active week.')
      } else {
        console.log('⚠️ WARNING: Expected only Week 5 to be active.')
      }
    }
    
    console.log('\n💡 Note: The live update service will now use Week 5 for updates.')
    console.log('💡 You may need to restart the live updates or wait for the next polling cycle.')
    
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  }
}

// Run the fix
fixWeekSettings().then(() => {
  console.log('\n✅ Script completed successfully!')
  process.exit(0)
}).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})