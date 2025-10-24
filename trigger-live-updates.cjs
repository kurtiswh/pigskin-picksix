/**
 * This script simulates what the frontend ScoreManager does to start live updates
 * It will check conditions and start polling if appropriate
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkConditionsAndAdvise() {
  console.log('🔍 Checking Live Update Conditions\n')
  console.log('=' .repeat(60))
  
  try {
    // 1. Check active week
    console.log('\n1️⃣ ACTIVE WEEK CHECK:')
    const { data: activeWeeks, error: weekError } = await supabase
      .from('week_settings')
      .select('week, season, picks_open')
      .eq('picks_open', true)
      .eq('season', 2025)
      .order('week', { ascending: false })
    
    if (!activeWeeks || activeWeeks.length === 0) {
      console.log('❌ No active week found (picks_open = true)')
      console.log('   Fix: Set picks_open = true for the current week')
      return
    }
    
    const activeWeek = activeWeeks[0]
    console.log(`✅ Active Week: ${activeWeek.week} (Season ${activeWeek.season})`)
    
    // 2. Check polling window
    console.log('\n2️⃣ POLLING WINDOW CHECK:')
    const now = new Date()
    const centralTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Chicago"}))
    const day = centralTime.getDay()
    const hour = centralTime.getHours()
    const minute = centralTime.getMinutes()
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    
    console.log(`Current time: ${centralTime.toLocaleString()} Central`)
    console.log(`Day: ${dayNames[day]}, Hour: ${hour}:${minute.toString().padStart(2, '0')}`)
    
    let isInPollingWindow = false
    let windowReason = ''
    
    if (day === 4 && hour >= 18) {
      isInPollingWindow = true
      windowReason = 'Thursday after 6pm'
    } else if (day === 5 || day === 6) {
      isInPollingWindow = true
      windowReason = day === 5 ? 'Friday (all day)' : 'Saturday (all day)'
    } else if (day === 0 && hour < 8) {
      isInPollingWindow = true
      windowReason = 'Sunday before 8am'
    } else {
      windowReason = 'Outside Thursday 6pm - Sunday 8am window'
    }
    
    console.log(`In polling window: ${isInPollingWindow ? '✅ YES' : '❌ NO'} (${windowReason})`)
    
    // 3. Check for active/approaching games
    console.log('\n3️⃣ GAME STATUS CHECK:')
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .eq('season', activeWeek.season)
      .eq('week', activeWeek.week)
    
    if (!games) {
      console.log('❌ Could not fetch games')
      return
    }
    
    const activeGames = games.filter(g => g.status === 'in_progress')
    const completedGames = games.filter(g => g.status === 'completed')
    const scheduledGames = games.filter(g => g.status === 'scheduled')
    
    console.log(`Total games: ${games.length}`)
    console.log(`  🔴 Live: ${activeGames.length}`)
    console.log(`  ✅ Completed: ${completedGames.length}`)
    console.log(`  ⏰ Scheduled: ${scheduledGames.length}`)
    
    // Check for approaching games
    const approachingGames = games.filter(game => {
      const kickoffTime = new Date(game.kickoff_time)
      const minutesUntilKickoff = (kickoffTime.getTime() - now.getTime()) / (1000 * 60)
      const minutesSinceKickoff = (now.getTime() - kickoffTime.getTime()) / (1000 * 60)
      
      return minutesUntilKickoff <= 30 || (minutesSinceKickoff >= 0 && minutesSinceKickoff <= 240)
    })
    
    console.log(`  🟡 Approaching/Recent: ${approachingGames.length}`)
    
    // 4. Determine if auto-start should trigger
    console.log('\n4️⃣ AUTO-START DECISION:')
    
    let shouldStart = false
    let startReason = ''
    
    if (activeGames.length > 0) {
      shouldStart = true
      startReason = `${activeGames.length} games currently live`
    } else if (approachingGames.length > 0) {
      shouldStart = true
      startReason = `${approachingGames.length} games approaching/recent`
    } else if (isInPollingWindow) {
      shouldStart = true
      startReason = 'In polling window'
    } else {
      startReason = 'No active games and outside polling window'
    }
    
    console.log(`Should auto-start: ${shouldStart ? '✅ YES' : '❌ NO'}`)
    console.log(`Reason: ${startReason}`)
    
    // 5. Show what would happen
    console.log('\n5️⃣ POLLING INTERVALS:')
    if (activeGames.length > 0) {
      console.log('⚡ With live games: Updates every 5 minutes')
    } else if (approachingGames.length > 0) {
      console.log('🟡 With approaching games: Updates every 10 minutes')
    } else if (isInPollingWindow) {
      console.log('📅 In polling window: Updates every 30 minutes')
    } else {
      console.log('⏸️ No automatic polling')
    }
    
    // 6. Instructions
    console.log('\n' + '='.repeat(60))
    console.log('\n📝 TO START LIVE UPDATES:')
    console.log('\n1. From the Admin Dashboard:')
    console.log('   - Go to Score Manager tab')
    console.log('   - Click "Start Live Updates" button')
    console.log('   - Or click "Start Smart Polling" for automatic intervals')
    
    console.log('\n2. The service should auto-start if:')
    console.log('   - There are live games')
    console.log('   - Games are approaching (within 30 minutes)')
    console.log('   - It\'s during the polling window (Thu 6pm - Sun 8am Central)')
    
    console.log('\n3. Current Status:')
    if (shouldStart) {
      console.log('   ✅ Conditions met for auto-start')
      console.log(`   Reason: ${startReason}`)
      console.log('   The frontend should start polling automatically')
    } else {
      console.log('   ❌ Conditions NOT met for auto-start')
      console.log(`   Reason: ${startReason}`)
      console.log('   You can still manually start updates from the Admin Dashboard')
    }
    
    // 7. Show any live games needing updates
    if (activeGames.length > 0) {
      console.log('\n🔥 LIVE GAMES NEEDING UPDATES:')
      activeGames.forEach(g => {
        const lastUpdate = new Date(g.updated_at)
        const minutesAgo = Math.round((now - lastUpdate) / 1000 / 60)
        console.log(`   ${g.away_team} @ ${g.home_team}`)
        console.log(`     Score: ${g.away_score || 0}-${g.home_score || 0}`)
        console.log(`     Period: ${g.game_period || '?'}, Clock: ${g.game_clock || '?'}`)
        console.log(`     Last updated: ${minutesAgo} minutes ago`)
      })
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

// Run the check
checkConditionsAndAdvise().then(() => {
  console.log('\n✅ Check complete')
  process.exit(0)
}).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})