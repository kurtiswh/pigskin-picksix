/**
 * CollegeFootballData API Integration
 * https://api.collegefootballdata.com/
 */

import { ENV } from '@/lib/env'
import { ApiQuotaService } from './apiQuotaService'

const BASE_URL = 'https://api.collegefootballdata.com'

// API now requires authentication for all endpoints
// Get your free API key at: https://collegefootballdata.com/
const API_KEY = ENV.CFBD_API_KEY

console.log('🏈 College Football API Config:', {
  hasApiKey: !!API_KEY,
  keyPreview: API_KEY ? API_KEY.slice(0, 10) + '...' : 'MISSING',
  envLoaded: !!ENV.CFBD_API_KEY
})

const getHeaders = () => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`
  }
  
  return headers
}

export interface CFBGame {
  id: number
  week: number
  season: number
  season_type: string
  start_date: string
  completed: boolean
  home_team: string
  away_team: string
  home_conference?: string
  away_conference?: string
  venue?: string
  venue_id?: number
  home_id?: number
  away_id?: number
  home_points?: number
  away_points?: number
  spread?: number
  home_line_scores?: number[]
  away_line_scores?: number[]
  attendance?: number
  neutral_site?: boolean
  home_ranking?: number
  away_ranking?: number
  game_importance?: number // calculated importance score
  custom_lock_time?: string // custom lock time set by admin
  // Live game data
  period?: number // Current quarter (1-4)
  clock?: string // Time remaining in quarter (e.g., "14:23")
  possession?: string // Team with possession
  down?: number // Current down (1-4)
  distance?: number // Yards to go
  yard_line?: number // Field position
}

export interface CFBTeam {
  id: number
  school: string
  mascot: string
  abbreviation: string
  conference: string
  division: string
  color?: string
  alt_color?: string
  logos?: string[]
}

export interface CFBBetting {
  id: number
  game_id: number
  season: number
  week: number
  season_type: string
  start_date: string
  home_team: string
  away_team: string
  lines: {
    provider: string
    spread?: number
    formatted_spread?: string
    spread_open?: number
    over_under?: number
    over_under_open?: number
  }[]
}

export interface CFBRanking {
  season: number
  seasonType: string
  week: number
  polls: {
    poll: string
    ranks: {
      rank: number
      school: string
      conference: string
      firstPlaceVotes: number
      points: number
    }[]
  }[]
}

/**
 * Fetch games for a specific week and season
 */
export async function getGames(
  season: number, 
  week: number, 
  seasonType: 'regular' | 'postseason' = 'regular',
  timeoutMs: number = 10000
): Promise<CFBGame[]> {
  try {
    // Check API quota before making call
    const quotaCheck = ApiQuotaService.canMakeApiCall(1)
    if (!quotaCheck.allowed) {
      console.warn('⚠️ CFBD API quota exceeded, using mock data:', quotaCheck.reason)
      return getMockGames(season, week)
    }
    
    const url = `${BASE_URL}/games?year=${season}&week=${week}&seasonType=${seasonType}`
    console.log('🏈 Fetching CFB games:', url)
    
    // Add timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    
    const response = await fetch(url, {
      headers: getHeaders(),
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (response.status === 429) {
      const responseData = await response.json().catch(() => ({}))
      const message = responseData.message || 'Rate limit exceeded'
      console.warn('⚠️ CFBD API quota exceeded for games request, using mock data')
      return getMockGames(season, week)
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    console.log(`✅ Fetched ${data.length} games for ${season} week ${week}`)
    
    // Record successful API call
    ApiQuotaService.recordApiCall(1)
    
    // Transform the API response to match our interface
    return data.map((game: any) => ({
      id: game.id,
      week: game.week,
      season: game.season,
      season_type: game.seasonType,
      start_date: game.startDate,
      completed: game.completed,
      home_team: game.homeTeam,
      away_team: game.awayTeam,
      home_conference: game.homeConference,
      away_conference: game.awayConference,
      venue: game.venue,
      venue_id: game.venueId,
      home_id: game.homeId,
      away_id: game.awayId,
      home_points: game.homePoints,
      away_points: game.awayPoints,
      home_line_scores: game.homeLineScores,
      away_line_scores: game.awayLineScores,
      attendance: game.attendance,
      neutral_site: game.neutralSite
    }))
  } catch (error) {
    console.error('❌ Error fetching CFB games:', error)
    throw error
  }
}

/**
 * Fetch betting lines for games
 */
export async function getBettingLines(
  season: number, 
  week: number, 
  seasonType: 'regular' | 'postseason' = 'regular',
  timeoutMs: number = 8000
): Promise<CFBBetting[]> {
  try {
    // Check API quota before making call
    const quotaCheck = ApiQuotaService.canMakeApiCall(1)
    if (!quotaCheck.allowed) {
      console.warn('⚠️ CFBD API quota exceeded for betting lines, skipping spreads:', quotaCheck.reason)
      return [] // Return empty array, games will work without spreads
    }

    const url = `${BASE_URL}/lines?year=${season}&week=${week}&seasonType=${seasonType}`
    console.log('💰 Fetching CFB betting lines:', url)
    
    // Add timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    
    const response = await fetch(url, {
      headers: getHeaders(),
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (response.status === 429) {
      const responseData = await response.json().catch(() => ({}))
      const message = responseData.message || 'Rate limit exceeded'
      console.warn('⚠️ CFBD API quota exceeded for betting lines, skipping spreads')
      return []  // Return empty array, games will work without spreads
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    console.log(`✅ Fetched betting lines for ${data.length} games`)
    
    // Record successful API call
    ApiQuotaService.recordApiCall(1)
    
    return data
  } catch (error) {
    console.error('❌ Error fetching betting lines:', error)
    throw error
  }
}

/**
 * Fetch teams for a season
 */
export async function getTeams(season: number): Promise<CFBTeam[]> {
  try {
    // Check API quota before making call
    const quotaCheck = ApiQuotaService.canMakeApiCall(1)
    if (!quotaCheck.allowed) {
      console.warn('⚠️ CFBD API quota exceeded for teams:', quotaCheck.reason)
      return [] // Return empty array
    }

    const url = `${BASE_URL}/teams?year=${season}`
    console.log('🏫 Fetching CFB teams:', url)
    
    const response = await fetch(url, {
      headers: getHeaders()
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    console.log(`✅ Fetched ${data.length} teams for ${season}`)
    
    // Record successful API call
    ApiQuotaService.recordApiCall(1)
    
    return data
  } catch (error) {
    console.error('❌ Error fetching teams:', error)
    throw error
  }
}

/**
 * Fetch rankings for a specific week and season
 */
export async function getRankings(
  season: number, 
  week: number, 
  seasonType: 'regular' | 'postseason' = 'regular',
  timeoutMs: number = 6000
): Promise<CFBRanking[]> {
  try {
    // Check API quota before making call
    const quotaCheck = ApiQuotaService.canMakeApiCall(1)
    if (!quotaCheck.allowed) {
      console.warn('⚠️ CFBD API quota exceeded for rankings:', quotaCheck.reason)
      return [] // Return empty array, games will work without rankings
    }

    const url = `${BASE_URL}/rankings?year=${season}&week=${week}&seasonType=${seasonType}`
    console.log('🏆 Fetching CFB rankings:', url)
    
    // Add timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    
    const response = await fetch(url, {
      headers: getHeaders(),
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    console.log(`✅ Fetched rankings for ${season} week ${week}`)
    
    // Record successful API call
    ApiQuotaService.recordApiCall(1)
    
    return data
  } catch (error) {
    console.error('❌ Error fetching rankings:', error)
    throw error
  }
}

/**
 * Combine games with betting lines and rankings
 */
/**
 * Fast version - gets games first, then optionally adds spreads
 */
export async function getGamesFast(
  season: number, 
  week: number, 
  seasonType: 'regular' | 'postseason' = 'regular',
  includeSpreads: boolean = false
): Promise<CFBGame[]> {
  try {
    console.log(`⚡ Fast loading games for ${season} week ${week} (spreads: ${includeSpreads})`)
    
    // Get games first (fastest call) with 6 second timeout
    const games = await getGames(season, week, seasonType, 6000)
    
    if (!includeSpreads || games.length === 0) {
      console.log(`✅ Fast loaded ${games.length} games without spreads`)
      return games
    }
    
    // Try to add spreads/rankings with shorter timeouts
    console.log('💰 Attempting to add spreads and rankings...')
    
    const [bettingResult, rankingResult] = await Promise.allSettled([
      getBettingLines(season, week, seasonType, 4000),
      getRankings(season, week, seasonType, 3000)
    ])
    
    const bettingLines = bettingResult.status === 'fulfilled' ? bettingResult.value : []
    const rankings = rankingResult.status === 'fulfilled' ? rankingResult.value : []
    
    return combineGamesWithData(games, bettingLines, rankings)
    
  } catch (error) {
    console.error('❌ Error in getGamesFast:', error)
    throw error
  }
}

/**
 * Original function with timeout fallback to mock data
 */
export async function getGamesWithSpreads(
  season: number, 
  week: number, 
  seasonType: 'regular' | 'postseason' = 'regular'
): Promise<CFBGame[]> {
  try {
    console.log(`🎯 Fetching games with spreads (with 10s timeout) for ${season} week ${week}`)
    
    // Try fast loading with timeout
    const timeoutPromise = new Promise<CFBGame[]>((resolve) => 
      setTimeout(() => {
        console.log('⏰ API timeout - using mock data')
        resolve(getMockGames(season, week))
      }, 10000)
    )
    
    const gamesPromise = getGamesFast(season, week, seasonType, true)
    
    return await Promise.race([gamesPromise, timeoutPromise])
    
  } catch (error) {
    console.error('❌ Error in getGamesWithSpreads, using mock data:', error)
    return getMockGames(season, week)
  }
}

/**
 * Helper function to combine games with betting and ranking data
 */
function combineGamesWithData(
  games: CFBGame[], 
  bettingLines: CFBBetting[], 
  rankings: CFBRanking[]
): CFBGame[] {
  // Create a map of game_id to betting info for quick lookup
  const bettingMap = new Map<number, number>()
  
  bettingLines.forEach(betting => {
    // Use the first available spread (typically from a major sportsbook)
    const spreadLine = betting.lines.find(line => line.spread !== undefined)
    if (spreadLine && spreadLine.spread !== undefined) {
      bettingMap.set(betting.id, spreadLine.spread)
    }
  })
  
  // Create a map of team names to rankings (use AP Poll or first available)
  const rankingMap = new Map<string, number>()
  
  if (rankings.length > 0) {
    const poll = rankings[0].polls.find(p => p.poll === 'AP Top 25') || rankings[0].polls[0]
    if (poll) {
      poll.ranks.forEach(rank => {
        rankingMap.set(rank.school, rank.rank)
      })
    }
  }
  
  // Calculate game importance and combine with spreads and rankings
  const gamesWithData = games.map(game => {
    const homeRanking = rankingMap.get(game.home_team)
    const awayRanking = rankingMap.get(game.away_team)
    
    // Calculate importance score (lower is more important)
    let importance = 1000 // default for unranked games
    
    if (homeRanking && awayRanking) {
      // Both ranked: average ranking (most important)
      importance = (homeRanking + awayRanking) / 2
    } else if (homeRanking || awayRanking) {
      // One ranked: use that ranking + penalty
      importance = (homeRanking || awayRanking)! + 25
    } else {
      // Neither ranked: check conference importance
      const majorConferences = ['SEC', 'Big Ten', 'Big 12', 'ACC', 'Pac-12']
      const homeIsMajor = majorConferences.includes(game.home_conference || '')
      const awayIsMajor = majorConferences.includes(game.away_conference || '')
      
      if (homeIsMajor && awayIsMajor) {
        importance = 100 // Major conference matchup
      } else if (homeIsMajor || awayIsMajor) {
        importance = 200 // One major conference team
      }
    }
    
    return {
      ...game,
      spread: bettingMap.get(game.id) || undefined,
      home_ranking: homeRanking,
      away_ranking: awayRanking,
      game_importance: importance
    }
  })
  
  // Filter out games without betting lines (likely FCS/Division II opponents)
  const gamesWithLines = gamesWithData.filter(game => game.spread !== undefined)
  
  // Sort by importance (most important first)
  const sortedGames = gamesWithLines.sort((a, b) => a.game_importance! - b.game_importance!)
  
  console.log(`✅ Combined ${gamesWithData.length} total games, filtered to ${sortedGames.length} games with betting lines`)
  console.log(`📊 Filtered out ${gamesWithData.length - sortedGames.length} games without betting lines (likely FCS opponents)`)
  console.log(`🏆 Games with ranked teams: ${sortedGames.filter(g => g.home_ranking || g.away_ranking).length}`)
  
  return sortedGames
}

/**
 * Get current week number based on date
 * This is a rough approximation - you might want to use the API's calendar endpoint for precision
 */
export function getCurrentWeek(season: number): number {
  const now = new Date()
  const currentYear = now.getFullYear()
  
  // If it's not the current season, default to week 1
  if (season !== currentYear) {
    return 1
  }
  
  // College football typically starts in late August/early September
  // This is a rough calculation - for more accuracy, use the API's calendar endpoint
  const seasonStart = new Date(season, 7, 25) // August 25th
  const daysSinceStart = Math.floor((now.getTime() - seasonStart.getTime()) / (1000 * 60 * 60 * 24))
  
  if (daysSinceStart < 0) {
    return 1 // Season hasn't started, return week 1
  }
  
  // Each week is roughly 7 days, but week 1 might be shorter
  const week = Math.min(Math.floor(daysSinceStart / 7) + 1, 15)
  
  return Math.max(week, 1)
}

/**
 * Mock data for development/testing when API is not available
 */
function getMockGames(season: number, week: number): CFBGame[] {
  const mockGames: CFBGame[] = [
    {
      id: 401520281,
      week,
      season,
      season_type: 'regular',
      start_date: '2024-09-07T19:00:00.000Z',
      completed: false,
      home_team: 'Alabama',
      away_team: 'Georgia',
      home_conference: 'SEC',
      away_conference: 'SEC',
      venue: 'Bryant-Denny Stadium',
      spread: -3.5
    },
    {
      id: 401520282,
      week,
      season,
      season_type: 'regular',
      start_date: '2024-09-07T15:30:00.000Z',
      completed: false,
      home_team: 'Ohio State',
      away_team: 'Michigan',
      home_conference: 'Big Ten',
      away_conference: 'Big Ten',
      venue: 'Ohio Stadium',
      spread: -7
    },
    {
      id: 401520283,
      week,
      season,
      season_type: 'regular',
      start_date: '2024-09-07T20:00:00.000Z',
      completed: false,
      home_team: 'Texas',
      away_team: 'Oklahoma',
      home_conference: 'SEC',
      away_conference: 'SEC',
      venue: 'Darrell K Royal Stadium',
      spread: -10.5
    },
    {
      id: 401520284,
      week,
      season,
      season_type: 'regular',
      start_date: '2024-09-07T17:00:00.000Z',
      completed: false,
      home_team: 'USC',
      away_team: 'Oregon',
      home_conference: 'Big Ten',
      away_conference: 'Big Ten',
      venue: 'Los Angeles Memorial Coliseum',
      spread: 2.5
    },
    {
      id: 401520285,
      week,
      season,
      season_type: 'regular',
      start_date: '2024-09-07T16:00:00.000Z',
      completed: false,
      home_team: 'Notre Dame',
      away_team: 'Navy',
      home_conference: 'Independent',
      away_conference: 'American Athletic',
      venue: 'Notre Dame Stadium',
      spread: -14
    }
  ]
  
  return mockGames
}

// CFBD Scoreboard API Response Interface
export interface CFBScoreboardGame {
  id: number
  startDate: string
  startTimeTBD: boolean
  tv?: string
  neutralSite: boolean
  conferenceGame: boolean
  status: string // 'scheduled', 'in_progress', 'completed', etc.
  period: number | null // Current quarter (1-4)
  clock: string | null // Time remaining (e.g., "14:23")
  situation: string | null
  possession: string | null
  lastPlay: string | null
  venue: {
    name: string
    city: string
    state: string
  }
  homeTeam: {
    id: number
    name: string
    conference: string
    classification: string
    points: number | null
    lineScores: number[] | null
    winProbability: number | null
  }
  awayTeam: {
    id: number
    name: string
    conference: string
    classification: string
    points: number | null
    lineScores: number[] | null
    winProbability: number | null
  }
  weather?: {
    temperature: number
    description: string
    windSpeed: number
    windDirection: number
  }
  betting?: {
    spread: number
    overUnder: number
    homeMoneyline: number
    awayMoneyline: number
  }
}

/**
 * Convert CFBD Scoreboard game to our CFBGame format
 */
function convertScoreboardGame(scoreboardGame: CFBScoreboardGame, week: number, season: number): CFBGame {
  // API-based completion detection - use only official status fields
  const isCompleted = scoreboardGame.status === 'completed' || scoreboardGame.status === 'final'

  return {
    id: scoreboardGame.id,
    week,
    season,
    season_type: 'regular',
    start_date: scoreboardGame.startDate,
    completed: isCompleted,
    home_team: scoreboardGame.homeTeam.name,
    away_team: scoreboardGame.awayTeam.name,
    home_conference: scoreboardGame.homeTeam.conference,
    away_conference: scoreboardGame.awayTeam.conference,
    venue: scoreboardGame.venue?.name,
    home_points: scoreboardGame.homeTeam.points,
    away_points: scoreboardGame.awayTeam.points,
    home_line_scores: scoreboardGame.homeTeam.lineScores || undefined,
    away_line_scores: scoreboardGame.awayTeam.lineScores || undefined,
    spread: scoreboardGame.betting?.spread,
    // Live game data from scoreboard API
    period: scoreboardGame.period,
    clock: scoreboardGame.clock,
    possession: scoreboardGame.possession,
  }
}

/**
 * Fetch live games with real clock data from CFBD Scoreboard API
 */
export async function getScoreboardGames(
  season: number,
  week: number,
  seasonType: 'regular' | 'postseason' = 'regular',
  timeoutMs: number = 8000
): Promise<CFBGame[]> {
  try {
    // Check API quota before making call
    const quotaCheck = ApiQuotaService.canMakeApiCall(1)
    if (!quotaCheck.allowed) {
      console.warn('⚠️ CFBD API quota exceeded for scoreboard request, falling back to regular games API')
      return getGames(season, week, seasonType)
    }
    
    const url = `${BASE_URL}/scoreboard?year=${season}&week=${week}&classification=fbs`
    console.log('🏈 Fetching CFBD scoreboard games:', url)
    
    // Add timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    
    const response = await fetch(url, {
      headers: getHeaders(),
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (response.status === 429) {
      console.warn('⚠️ CFBD API quota exceeded for scoreboard request, falling back to regular games API')
      return getGames(season, week, seasonType)
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const scoreboardData: CFBScoreboardGame[] = await response.json()
    console.log(`✅ Loaded ${scoreboardData.length} games from scoreboard API`)
    
    // Record successful API call
    ApiQuotaService.recordApiCall(1)
    
    // Convert scoreboard games to CFBGame format
    const games = scoreboardData.map(game => convertScoreboardGame(game, week, season))
    
    // Log live games found
    const liveGames = games.filter(g => g.period !== null && g.clock !== null)
    if (liveGames.length > 0) {
      console.log(`🔴 Found ${liveGames.length} live games with clock data:`)
      liveGames.forEach(game => {
        console.log(`  ${game.away_team} @ ${game.home_team} - Q${game.period} ${game.clock}`)
      })
    }
    
    return games
    
  } catch (error) {
    console.error('❌ Error fetching scoreboard games:', error)
    console.log('⚠️ Falling back to regular games API')
    return getGames(season, week, seasonType)
  }
}

/**
 * Update game scores from API and return updated games with real live data
 */
export async function updateGameScores(gameIds: number[]): Promise<CFBGame[]> {
  try {
    console.log(`🔄 Updating scores for ${gameIds.length} games`)
    
    if (gameIds.length === 0) {
      return []
    }
    
    // Get current season and week (we'll improve this later)
    const currentSeason = new Date().getFullYear()
    const currentWeek = getCurrentWeek(currentSeason)
    
    // Use scoreboard API for real live data
    const games = await getScoreboardGames(currentSeason, currentWeek, 'regular')
    
    // Filter to only the games we're tracking
    const trackedGames = games.filter(game => gameIds.includes(game.id))
    
    console.log(`✅ Updated ${trackedGames.length} tracked games with real live data from CFBD scoreboard`)
    return trackedGames
    
  } catch (error) {
    console.error('❌ Error updating game scores:', error)
    throw error
  }
}

/**
 * Get live games with real clock data from CFBD Scoreboard API
 */
export async function getLiveGames(
  season: number,
  week: number,
  seasonType: 'regular' | 'postseason' = 'regular'
): Promise<CFBGame[]> {
  try {
    console.log(`🔴 Fetching live games for ${season} week ${week}`)
    
    // Use scoreboard API to get real live data
    const games = await getScoreboardGames(season, week, seasonType)
    
    // Filter to games with live data (in progress with period/clock)
    const liveGames = games.filter(game => 
      game.status !== 'scheduled' && 
      game.status !== 'completed' &&
      (game.period !== null || game.clock !== null || game.home_points !== null)
    )
    
    console.log(`✅ Found ${liveGames.length} live games with real clock data`)
    return liveGames
    
  } catch (error) {
    console.error('❌ Error fetching live games:', error)
    throw error
  }
}

/**
 * Get completed games with final scores
 */
export async function getCompletedGames(
  season: number,
  week: number,
  seasonType: 'regular' | 'postseason' = 'regular'
): Promise<CFBGame[]> {
  try {
    const games = await getGames(season, week, seasonType)
    return games.filter(game => game.completed && (game.home_points !== null || game.away_points !== null))
  } catch (error) {
    console.error('❌ Error fetching completed games:', error)
    throw error
  }
}

/**
 * Check if the API is accessible with timeout
 */
export async function testApiConnection(timeoutMs: number = 5000): Promise<{ 
  connected: boolean; 
  error?: string; 
  quotaExceeded?: boolean;
  status?: number 
}> {
  try {
    if (!API_KEY) {
      console.warn('⚠️ No CFBD API key found. Set VITE_CFBD_API_KEY environment variable.')
      return { connected: false, error: 'No API key configured' }
    }
    
    // Check API quota before making test call
    const quotaCheck = ApiQuotaService.canMakeApiCall(1)
    if (!quotaCheck.allowed) {
      console.warn('⚠️ API quota exceeded for connection test:', quotaCheck.reason)
      return { 
        connected: false, 
        error: quotaCheck.reason, 
        quotaExceeded: true,
        status: 429 
      }
    }
    
    // Add timeout to API connection test
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    
    const response = await fetch(`${BASE_URL}/teams?year=2024`, { 
      method: 'GET',
      headers: getHeaders(),
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (response.status === 401) {
      console.error('❌ API key is invalid or missing. Get a free key at https://collegefootballdata.com/')
      return { connected: false, error: 'Invalid API key', status: 401 }
    }
    
    if (response.status === 429) {
      const responseData = await response.json().catch(() => ({}))
      const message = responseData.message || 'Rate limit exceeded'
      console.warn('⚠️ CFBD API quota exceeded:', message)
      return { 
        connected: false, 
        error: message, 
        quotaExceeded: true, 
        status: 429 
      }
    }
    
    if (response.status === 403) {
      console.error('❌ API access forbidden. Check API key permissions.')
      return { connected: false, error: 'Access forbidden', status: 403 }
    }
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      return { 
        connected: false, 
        error: `HTTP ${response.status}: ${errorText}`, 
        status: response.status 
      }
    }
    
    console.log('✅ CFBD API connection successful')
    
    // Record successful API call
    ApiQuotaService.recordApiCall(1)
    
    return { connected: true }
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('⏰ API connection test timed out')
      return { connected: false, error: 'Connection timeout' }
    } else {
      console.error('❌ API connection test failed:', error)
      return { connected: false, error: error.message || 'Network error' }
    }
  }
}