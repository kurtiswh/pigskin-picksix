const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const cfbdApiKey = process.env.VITE_CFBD_API_KEY

if (!supabaseUrl || !supabaseKey || !cfbdApiKey) {
  console.error('❌ Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkAndUpdateGames() {
  console.log('🏈 Checking and Starting Live Updates for Week 5\n')
  console.log('=' .repeat(60))
  
  try {
    // Step 1: Verify Week 5 is active
    console.log('\n📊 Step 1: Verifying Week 5 is active...')
    const { data: weekSettings, error: weekError } = await supabase
      .from('week_settings')
      .select('*')
      .eq('season', 2025)
      .eq('week', 5)
      .single()
    
    if (weekError) throw new Error(`Week settings error: ${weekError.message}`)
    
    console.log(`Week 5 Status:`)
    console.log(`  picks_open: ${weekSettings.picks_open}`)
    console.log(`  games_locked: ${weekSettings.games_locked}`)
    
    if (!weekSettings.picks_open) {
      console.log('⚠️ Week 5 picks_open is false - this will prevent automatic updates!')
    }
    
    // Step 2: Check current time and polling window
    console.log('\n⏰ Step 2: Checking polling window...')
    const now = new Date()
    const centralTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Chicago"}))
    const day = centralTime.getDay()
    const hour = centralTime.getHours()
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    
    console.log(`Current time: ${centralTime.toLocaleString()} Central`)
    console.log(`Day: ${dayNames[day]}, Hour: ${hour}`)
    
    // Polling window: Thursday 6pm - Sunday 8am Central
    let isInPollingWindow = false
    if (day === 4 && hour >= 18) isInPollingWindow = true // Thursday after 6pm
    else if (day === 5 || day === 6) isInPollingWindow = true // Friday or Saturday
    else if (day === 0 && hour < 8) isInPollingWindow = true // Sunday before 8am
    
    console.log(`In polling window: ${isInPollingWindow ? '✅ YES' : '❌ NO'}`)
    
    // Step 3: Get Week 5 games
    console.log('\n🎮 Step 3: Getting Week 5 games...')
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .eq('season', 2025)
      .eq('week', 5)
      .order('kickoff_time')
    
    if (gamesError) throw new Error(`Games error: ${gamesError.message}`)
    
    console.log(`Found ${games.length} games in Week 5`)
    
    const liveGames = games.filter(g => g.status === 'in_progress')
    const completedGames = games.filter(g => g.status === 'completed')
    const scheduledGames = games.filter(g => g.status === 'scheduled')
    
    console.log(`  Live: ${liveGames.length} games`)
    console.log(`  Completed: ${completedGames.length} games`)
    console.log(`  Scheduled: ${scheduledGames.length} games`)
    
    if (liveGames.length > 0) {
      console.log('\n🔥 Live games:')
      liveGames.forEach(g => {
        console.log(`  - ${g.away_team} @ ${g.home_team}: ${g.away_score || 0}-${g.home_score || 0}`)
        console.log(`    Period: ${g.game_period || g.api_period || '?'}, Clock: ${g.game_clock || g.api_clock || '?'}`)
      })
    }
    
    // Step 4: Call CFBD API to get latest data
    console.log('\n📡 Step 4: Fetching latest data from CFBD API...')
    const cfbdUrl = `https://api.collegefootballdata.com/scoreboard?year=2025&week=5&classification=fbs`
    
    const response = await fetch(cfbdUrl, {
      headers: {
        'Authorization': `Bearer ${cfbdApiKey}`
      }
    })
    
    if (!response.ok) {
      throw new Error(`CFBD API error: ${response.status} - ${response.statusText}`)
    }
    
    const cfbdGames = await response.json()
    console.log(`CFBD returned ${cfbdGames.length} games`)
    
    // Step 5: Update database with CFBD data
    console.log('\n🔄 Step 5: Updating database with CFBD data...')
    let updatedCount = 0
    
    for (const dbGame of games) {
      // Find matching CFBD game
      const cfbdGame = cfbdGames.find(cfbd => {
        const dbHome = dbGame.home_team.toLowerCase().replace(/[^a-z0-9]/g, '')
        const dbAway = dbGame.away_team.toLowerCase().replace(/[^a-z0-9]/g, '')
        const cfbdHome = (cfbd.homeTeam?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
        const cfbdAway = (cfbd.awayTeam?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
        
        return (dbHome.includes(cfbdHome.substring(0, 5)) || cfbdHome.includes(dbHome.substring(0, 5))) &&
               (dbAway.includes(cfbdAway.substring(0, 5)) || cfbdAway.includes(dbAway.substring(0, 5)))
      })
      
      if (cfbdGame) {
        const updates = {}
        let hasUpdates = false
        
        // Update status
        if (cfbdGame.status !== dbGame.status) {
          updates.status = cfbdGame.status
          hasUpdates = true
        }
        
        // Update scores
        if (cfbdGame.homeTeam.points !== dbGame.home_score) {
          updates.home_score = cfbdGame.homeTeam.points
          hasUpdates = true
        }
        if (cfbdGame.awayTeam.points !== dbGame.away_score) {
          updates.away_score = cfbdGame.awayTeam.points
          hasUpdates = true
        }
        
        // Update period and clock - handle nulls for completed games
        if (cfbdGame.status === 'in_progress') {
          if (cfbdGame.period !== dbGame.game_period) {
            updates.game_period = cfbdGame.period
            updates.api_period = cfbdGame.period
            hasUpdates = true
          }
          if (cfbdGame.clock !== dbGame.game_clock) {
            updates.game_clock = cfbdGame.clock
            updates.api_clock = cfbdGame.clock
            hasUpdates = true
          }
        }
        
        if (hasUpdates) {
          updates.updated_at = new Date().toISOString()
          
          const { error: updateError } = await supabase
            .from('games')
            .update(updates)
            .eq('id', dbGame.id)
          
          if (updateError) {
            console.log(`❌ Failed to update ${dbGame.away_team} @ ${dbGame.home_team}: ${updateError.message}`)
          } else {
            updatedCount++
            console.log(`✅ Updated ${dbGame.away_team} @ ${dbGame.home_team}`)
            console.log(`   Changes:`, updates)
          }
        }
      }
    }
    
    console.log(`\n📊 Updated ${updatedCount} games`)
    
    // Step 6: Show Oregon vs Penn State specifically
    console.log('\n🎯 Step 6: Oregon vs Penn State Game Status:')
    const oregonPennState = games.find(g => 
      (g.home_team.includes('Penn') || g.away_team.includes('Penn')) &&
      (g.home_team.includes('Oregon') || g.away_team.includes('Oregon'))
    )
    
    if (oregonPennState) {
      console.log('Found in database:')
      console.log(`  ${oregonPennState.away_team} @ ${oregonPennState.home_team}`)
      console.log(`  Score: ${oregonPennState.away_score || 0} - ${oregonPennState.home_score || 0}`)
      console.log(`  Status: ${oregonPennState.status}`)
      console.log(`  Period: ${oregonPennState.game_period || oregonPennState.api_period || 'null'}`)
      console.log(`  Clock: ${oregonPennState.game_clock || oregonPennState.api_clock || 'null'}`)
      
      // Check if it shows overtime correctly
      if (oregonPennState.game_period > 4 || oregonPennState.api_period > 4) {
        const period = oregonPennState.game_period || oregonPennState.api_period
        const otNumber = period - 4
        console.log(`  🏈 OVERTIME: ${otNumber === 1 ? 'OT' : otNumber + 'OT'}`)
      }
    } else {
      console.log('❌ Oregon vs Penn State not found in Week 5 games')
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ Live update check complete!')
    console.log('\n💡 Notes:')
    console.log('- Live updates should run automatically during the polling window')
    console.log('- Polling window: Thursday 6pm - Sunday 8am Central')
    console.log('- Updates run every 5 minutes for live games')
    console.log('- Make sure the frontend is refreshing to see updates')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

// Run the check and update
checkAndUpdateGames().then(() => {
  console.log('\n✅ Script completed')
  process.exit(0)
}).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})