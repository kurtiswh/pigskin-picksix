#!/usr/bin/env node

// Check CFBD API vs Database for Oregon vs Penn State game timing
import { config } from 'dotenv'
import fetch from 'node-fetch'

config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const CFBD_API_KEY = process.env.VITE_CFBD_API_KEY

console.log('🏈 Checking Oregon vs Penn State game data...\n')

async function fetchSupabaseData(table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value)
  })
  
  const response = await fetch(url.toString(), {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    }
  })
  
  if (!response.ok) {
    throw new Error(`Supabase API error: ${response.status} ${response.statusText}`)
  }
  
  return response.json()
}

async function fetchCFBDScoreboard(season, week) {
  const url = `https://api.collegefootballdata.com/scoreboard?year=${season}&week=${week}&classification=fbs`
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${CFBD_API_KEY}`,
      'Content-Type': 'application/json'
    }
  })
  
  if (!response.ok) {
    throw new Error(`CFBD API error: ${response.status} ${response.statusText}`)
  }
  
  return response.json()
}

async function main() {
  try {
    // Step 1: Get current week and season
    console.log('📊 Getting current week and season...')
    const weekSettings = await fetchSupabaseData('week_settings', {
      'order': 'week.desc',
      'limit': '1'
    })
    
    if (!weekSettings.length) {
      console.error('❌ No week settings found!')
      return
    }
    
    const currentSeason = weekSettings[0].season
    const currentWeek = weekSettings[0].week
    
    console.log(`✅ Current: Season ${currentSeason}, Week ${currentWeek}\n`)
    
    // Step 2: Fetch CFBD scoreboard data
    console.log('🌐 Fetching CFBD scoreboard data...')
    const cfbdGames = await fetchCFBDScoreboard(currentSeason, currentWeek)
    
    console.log('📋 Raw CFBD Response (first few games):')
    console.log(JSON.stringify(cfbdGames.slice(0, 3), null, 2))
    console.log('\n')
    
    // Step 3: Find Oregon vs Penn State game in CFBD data
    console.log('🔍 Looking for Oregon vs Penn State game...')
    
    // Let's try different ways to access team names
    console.log('🔍 Analyzing game structure...')
    if (cfbdGames.length > 0) {
      const sampleGame = cfbdGames[0]
      console.log('Sample game structure:', Object.keys(sampleGame))
      console.log('Sample game:', JSON.stringify(sampleGame, null, 2))
    }
    
    const oregonPennStateGame = cfbdGames.find(game => {
      const homeTeam = game.homeTeam?.name?.toLowerCase() || ''
      const awayTeam = game.awayTeam?.name?.toLowerCase() || ''
      
      console.log(`Checking: ${awayTeam} @ ${homeTeam}`)
      
      return (
        (homeTeam.includes('oregon') && awayTeam.includes('penn state')) ||
        (homeTeam.includes('penn state') && awayTeam.includes('oregon'))
      )
    })
    
    if (!oregonPennStateGame) {
      console.log('❌ Oregon vs Penn State game not found in CFBD data')
      console.log('Available games:')
      cfbdGames.forEach((game, idx) => {
        const homeTeam = game.homeTeam?.name || 'Unknown'
        const awayTeam = game.awayTeam?.name || 'Unknown'
        console.log(`  ${idx + 1}: ${awayTeam} @ ${homeTeam}`)
      })
      return
    }
    
    console.log('✅ Found Oregon vs Penn State game in CFBD data!\n')
    
    // Step 4: Extract timing data from CFBD
    console.log('⏰ CFBD Timing Data:')
    console.log('==================')
    console.log('Raw CFBD Game Object:')
    console.log(JSON.stringify(oregonPennStateGame, null, 2))
    console.log('\n')
    
    console.log('Key Timing Fields:')
    console.log(`  period: ${oregonPennStateGame.period}`)
    console.log(`  clock: ${oregonPennStateGame.clock}`)
    console.log(`  status: ${oregonPennStateGame.status}`)
    console.log(`  completed: ${oregonPennStateGame.completed}`)
    console.log(`  neutral_site: ${oregonPennStateGame.neutral_site}`)
    console.log(`  home_team: ${oregonPennStateGame.homeTeam?.school} (${oregonPennStateGame.homeTeam?.points})`)
    console.log(`  away_team: ${oregonPennStateGame.awayTeam?.school} (${oregonPennStateGame.awayTeam?.points})`)
    console.log('\n')
    
    // Step 5: Query database for this game
    console.log('🗄️  Fetching database data...')
    const dbGames = await fetchSupabaseData('games', {
      'season': `eq.${currentSeason}`,
      'week': `eq.${currentWeek}`,
      'select': '*'
    })
    
    // Find matching game in database
    const dbGame = dbGames.find(game => {
      const homeTeam = game.home_team?.toLowerCase()
      const awayTeam = game.away_team?.toLowerCase()
      
      return (
        (homeTeam?.includes('oregon') && awayTeam?.includes('penn state')) ||
        (homeTeam?.includes('penn state') && awayTeam?.includes('oregon'))
      )
    })
    
    if (!dbGame) {
      console.log('❌ Oregon vs Penn State game not found in database')
      console.log('Available games in database:')
      dbGames.forEach(game => {
        console.log(`  ${game.away_team} @ ${game.home_team}`)
      })
      return
    }
    
    console.log('✅ Found Oregon vs Penn State game in database!\n')
    
    // Step 6: Display database timing data
    console.log('💾 Database Timing Data:')
    console.log('========================')
    console.log(`  game_id: ${dbGame.id}`)
    console.log(`  home_team: ${dbGame.home_team} (${dbGame.home_score})`)
    console.log(`  away_team: ${dbGame.away_team} (${dbGame.away_score})`)
    console.log(`  status: ${dbGame.status}`)
    console.log(`  completed: ${dbGame.completed}`)
    console.log(`  game_period: ${dbGame.game_period}`)
    console.log(`  game_clock: ${dbGame.game_clock}`)
    console.log(`  api_period: ${dbGame.api_period}`)
    console.log(`  api_clock: ${dbGame.api_clock}`)
    console.log(`  last_updated: ${dbGame.updated_at}`)
    console.log('\n')
    
    // Step 7: Compare the data
    console.log('🔍 Data Comparison:')
    console.log('==================')
    
    const comparisons = [
      {
        field: 'Period',
        cfbd: oregonPennStateGame.period,
        db_game: dbGame.game_period,
        db_api: dbGame.api_period
      },
      {
        field: 'Clock',
        cfbd: oregonPennStateGame.clock,
        db_game: dbGame.game_clock,
        db_api: dbGame.api_clock
      },
      {
        field: 'Status',
        cfbd: oregonPennStateGame.status,
        db_game: dbGame.status,
        db_api: 'N/A'
      },
      {
        field: 'Completed',
        cfbd: oregonPennStateGame.completed,
        db_game: dbGame.completed,
        db_api: 'N/A'
      },
      {
        field: 'Home Score',
        cfbd: oregonPennStateGame.homeTeam?.points,
        db_game: dbGame.home_score,
        db_api: 'N/A'
      },
      {
        field: 'Away Score',
        cfbd: oregonPennStateGame.awayTeam?.points,
        db_game: dbGame.away_score,
        db_api: 'N/A'
      }
    ]
    
    comparisons.forEach(comp => {
      const cfbdDbMatch = comp.cfbd === comp.db_game
      const cfbdApiMatch = comp.db_api !== 'N/A' ? comp.cfbd === comp.db_api : true
      
      console.log(`${comp.field}:`)
      console.log(`  CFBD:     ${comp.cfbd}`)
      console.log(`  DB Game:  ${comp.db_game} ${cfbdDbMatch ? '✅' : '❌'}`)
      if (comp.db_api !== 'N/A') {
        console.log(`  DB API:   ${comp.db_api} ${cfbdApiMatch ? '✅' : '❌'}`)
      }
      console.log('')
    })
    
    // Specific overtime analysis
    if (oregonPennStateGame.period && oregonPennStateGame.period > 4) {
      console.log('🔥 OVERTIME DETECTED!')
      console.log('====================')
      console.log(`CFBD shows period ${oregonPennStateGame.period} (OT${oregonPennStateGame.period - 4})`)
      console.log(`Database game_period: ${dbGame.game_period}`)
      console.log(`Database api_period: ${dbGame.api_period}`)
      
      if (dbGame.game_period !== oregonPennStateGame.period) {
        console.log('❌ MISMATCH: Database not reflecting correct overtime period!')
      } else {
        console.log('✅ Database correctly shows overtime period')
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error)
  }
}

main()