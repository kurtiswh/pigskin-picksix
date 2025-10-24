const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const cfbdApiKey = process.env.VITE_CFBD_API_KEY

if (!supabaseUrl || !supabaseKey || !cfbdApiKey) {
  console.error('❌ Missing required environment variables')
  console.log('VITE_SUPABASE_URL:', !!supabaseUrl)
  console.log('VITE_SUPABASE_ANON_KEY:', !!supabaseKey)
  console.log('VITE_CFBD_API_KEY:', !!cfbdApiKey)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkOvertimeGame() {
  try {
    console.log('🏈 Checking Oregon vs Penn State Overtime Game\n')
    console.log('=' .repeat(60))
    
    // Step 1: Get active week from database
    console.log('\n📊 STEP 1: Getting active week from database...')
    const { data: weekSettings, error: weekError } = await supabase
      .from('week_settings')
      .select('week, season')
      .eq('picks_open', true)
      .order('week', { ascending: false })
      .limit(1)
    
    if (weekError) throw new Error(`Week settings error: ${weekError.message}`)
    if (!weekSettings || weekSettings.length === 0) {
      throw new Error('No active week found')
    }
    
    const { week, season } = weekSettings[0]
    console.log(`✅ Active Week: ${week}, Season: ${season}`)
    
    // Step 2: Get Oregon vs Penn State game from database
    console.log('\n📊 STEP 2: Getting game data from database...')
    const { data: dbGames, error: dbError } = await supabase
      .from('games')
      .select('*')
      .eq('season', season)
      .eq('week', week)
      .or('home_team.ilike.%oregon%,away_team.ilike.%oregon%')
    
    if (dbError) throw new Error(`Database error: ${dbError.message}`)
    
    // Find the Oregon vs Penn State game
    const oregonPennState = dbGames?.find(game => 
      (game.home_team.toLowerCase().includes('oregon') || 
       game.away_team.toLowerCase().includes('oregon')) &&
      (game.home_team.toLowerCase().includes('penn') || 
       game.away_team.toLowerCase().includes('penn'))
    )
    
    if (oregonPennState) {
      console.log('\n🎮 DATABASE GAME DATA:')
      console.log('-'.repeat(40))
      console.log(`Game ID: ${oregonPennState.id}`)
      console.log(`Teams: ${oregonPennState.away_team} @ ${oregonPennState.home_team}`)
      console.log(`Score: ${oregonPennState.away_score || 0} - ${oregonPennState.home_score || 0}`)
      console.log(`Status: ${oregonPennState.status}`)
      console.log('\n⏰ TIMING DATA IN DATABASE:')
      console.log(`game_period: ${oregonPennState.game_period} (type: ${typeof oregonPennState.game_period})`)
      console.log(`game_clock: ${oregonPennState.game_clock}`)
      console.log(`api_period: ${oregonPennState.api_period} (type: ${typeof oregonPennState.api_period})`)
      console.log(`api_clock: ${oregonPennState.api_clock}`)
      console.log(`api_completed: ${oregonPennState.api_completed}`)
      console.log(`updated_at: ${oregonPennState.updated_at}`)
    } else {
      console.log('⚠️ Oregon vs Penn State game not found in database')
    }
    
    // Step 3: Call CFBD API
    console.log('\n📡 STEP 3: Calling CFBD API...')
    const cfbdUrl = `https://api.collegefootballdata.com/scoreboard?year=${season}&week=${week}&classification=fbs`
    console.log(`API URL: ${cfbdUrl}`)
    
    const response = await fetch(cfbdUrl, {
      headers: {
        'Authorization': `Bearer ${cfbdApiKey}`
      }
    })
    
    if (!response.ok) {
      throw new Error(`CFBD API error: ${response.status} - ${response.statusText}`)
    }
    
    const cfbdGames = await response.json()
    console.log(`✅ CFBD returned ${cfbdGames.length} games`)
    
    // Step 4: Find Oregon vs Penn State in CFBD response
    console.log('\n🔍 STEP 4: Finding Oregon vs Penn State in CFBD data...')
    
    let cfbdOregonPennState = null
    
    for (const game of cfbdGames) {
      const homeTeam = game.homeTeam?.name?.toLowerCase() || ''
      const awayTeam = game.awayTeam?.name?.toLowerCase() || ''
      
      if ((homeTeam.includes('oregon') || awayTeam.includes('oregon')) &&
          (homeTeam.includes('penn') || awayTeam.includes('penn'))) {
        cfbdOregonPennState = game
        break
      }
    }
    
    if (cfbdOregonPennState) {
      console.log('\n🎯 CFBD API GAME DATA:')
      console.log('-'.repeat(40))
      console.log('RAW CFBD GAME OBJECT:')
      console.log(JSON.stringify(cfbdOregonPennState, null, 2))
      
      console.log('\n📊 CFBD TIMING DETAILS:')
      console.log(`Teams: ${cfbdOregonPennState.awayTeam.name} @ ${cfbdOregonPennState.homeTeam.name}`)
      console.log(`Score: ${cfbdOregonPennState.awayTeam.points || 0} - ${cfbdOregonPennState.homeTeam.points || 0}`)
      console.log(`Status: ${cfbdOregonPennState.status}`)
      console.log(`Period: ${cfbdOregonPennState.period} (type: ${typeof cfbdOregonPennState.period})`)
      console.log(`Clock: ${cfbdOregonPennState.clock}`)
      console.log(`Completed: ${cfbdOregonPennState.completed}`)
      
      // Check for any other timing-related fields
      console.log('\n🔍 ALL CFBD FIELDS:')
      const allFields = Object.keys(cfbdOregonPennState).sort()
      allFields.forEach(field => {
        if (field.toLowerCase().includes('period') || 
            field.toLowerCase().includes('quarter') || 
            field.toLowerCase().includes('clock') ||
            field.toLowerCase().includes('time') ||
            field.toLowerCase().includes('overtime')) {
          console.log(`${field}: ${JSON.stringify(cfbdOregonPennState[field])}`)
        }
      })
      
      // Step 5: Compare data
      console.log('\n🔄 STEP 5: DATA COMPARISON')
      console.log('=' .repeat(40))
      
      if (oregonPennState) {
        console.log('\n📋 PERIOD/QUARTER COMPARISON:')
        console.log(`Database game_period: ${oregonPennState.game_period}`)
        console.log(`Database api_period: ${oregonPennState.api_period}`)
        console.log(`CFBD period: ${cfbdOregonPennState.period}`)
        
        if (cfbdOregonPennState.period > 4) {
          console.log(`\n🚨 OVERTIME DETECTED IN CFBD!`)
          console.log(`CFBD shows period ${cfbdOregonPennState.period} (OT ${cfbdOregonPennState.period - 4})`)
          
          if (oregonPennState.game_period !== cfbdOregonPennState.period) {
            console.log(`⚠️ DATABASE NOT UPDATED! Still shows period ${oregonPennState.game_period}`)
          }
        }
        
        console.log('\n📋 CLOCK COMPARISON:')
        console.log(`Database game_clock: ${oregonPennState.game_clock}`)
        console.log(`Database api_clock: ${oregonPennState.api_clock}`)
        console.log(`CFBD clock: ${cfbdOregonPennState.clock}`)
        
        console.log('\n📋 STATUS COMPARISON:')
        console.log(`Database status: ${oregonPennState.status}`)
        console.log(`CFBD status: ${cfbdOregonPennState.status}`)
        
        // Check when database was last updated
        const dbUpdateTime = new Date(oregonPennState.updated_at)
        const now = new Date()
        const minutesAgo = Math.floor((now - dbUpdateTime) / 1000 / 60)
        console.log(`\n⏱️ Database last updated: ${minutesAgo} minutes ago`)
        
        if (minutesAgo > 5) {
          console.log('⚠️ Database hasn\'t been updated in over 5 minutes!')
        }
      }
      
    } else {
      console.log('❌ Oregon vs Penn State game not found in CFBD response')
      console.log('\nAll CFBD games:')
      cfbdGames.forEach(game => {
        console.log(`- ${game.awayTeam.name} @ ${game.homeTeam.name}`)
      })
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ Analysis complete!')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

// Run the check
checkOvertimeGame().then(() => {
  console.log('\n👋 Script completed')
  process.exit(0)
}).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})