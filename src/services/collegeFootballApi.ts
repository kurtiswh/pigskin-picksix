/**
 * CollegeFootballData API Integration
 * https://api.collegefootballdata.com/
 */

const BASE_URL = 'https://api.collegefootballdata.com'

// API now requires authentication for all endpoints
// Get your free API key at: https://collegefootballdata.com/
const API_KEY = import.meta.env.VITE_CFBD_API_KEY

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
  seasonType: 'regular' | 'postseason' = 'regular'
): Promise<CFBGame[]> {
  try {
    const url = `${BASE_URL}/games?year=${season}&week=${week}&seasonType=${seasonType}`
    console.log('🏈 Fetching CFB games:', url)
    
    const response = await fetch(url, {
      headers: getHeaders()
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    console.log(`✅ Fetched ${data.length} games for ${season} week ${week}`)
    
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
  seasonType: 'regular' | 'postseason' = 'regular'
): Promise<CFBBetting[]> {
  try {
    const url = `${BASE_URL}/lines?year=${season}&week=${week}&seasonType=${seasonType}`
    console.log('💰 Fetching CFB betting lines:', url)
    
    const response = await fetch(url, {
      headers: getHeaders()
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    console.log(`✅ Fetched betting lines for ${data.length} games`)
    
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
  seasonType: 'regular' | 'postseason' = 'regular'
): Promise<CFBRanking[]> {
  try {
    const url = `${BASE_URL}/rankings?year=${season}&week=${week}&seasonType=${seasonType}`
    console.log('🏆 Fetching CFB rankings:', url)
    
    const response = await fetch(url, {
      headers: getHeaders()
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    console.log(`✅ Fetched rankings for ${season} week ${week}`)
    
    return data
  } catch (error) {
    console.error('❌ Error fetching rankings:', error)
    throw error
  }
}

/**
 * Combine games with betting lines and rankings
 */
export async function getGamesWithSpreads(
  season: number, 
  week: number, 
  seasonType: 'regular' | 'postseason' = 'regular'
): Promise<CFBGame[]> {
  try {
    console.log(`🎯 Fetching games with spreads and rankings for ${season} week ${week}`)
    
    // Fetch games, betting lines, and rankings in parallel
    const [games, bettingLines, rankings] = await Promise.all([
      getGames(season, week, seasonType),
      getBettingLines(season, week, seasonType).catch(err => {
        console.warn('⚠️ Could not fetch betting lines, continuing without spreads:', err.message)
        return []
      }),
      getRankings(season, week, seasonType).catch(async err => {
        console.warn('⚠️ Could not fetch current rankings, trying previous season:', err.message)
        // Try previous season's final rankings as fallback
        try {
          return await getRankings(season - 1, 15, 'regular')
        } catch (fallbackErr) {
          console.warn('⚠️ Could not fetch fallback rankings either, continuing without rankings')
          return []
        }
      })
    ])
    
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
    
    // Sort by importance (most important first)
    const sortedGames = gamesWithData.sort((a, b) => a.game_importance! - b.game_importance!)
    
    console.log(`✅ Combined ${sortedGames.length} games with spreads and rankings`)
    console.log(`📊 Games with spreads: ${sortedGames.filter(g => g.spread !== undefined).length}`)
    console.log(`🏆 Games with ranked teams: ${sortedGames.filter(g => g.home_ranking || g.away_ranking).length}`)
    
    return sortedGames
  } catch (error) {
    console.error('❌ Error fetching games with spreads and rankings:', error)
    throw error
  }
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

/**
 * Update game scores from API and return updated games
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
    
    // Fetch current games with scores
    const games = await getGames(currentSeason, currentWeek, 'regular')
    
    // Filter to only the games we're tracking
    const trackedGames = games.filter(game => gameIds.includes(game.id))
    
    console.log(`✅ Updated ${trackedGames.length} tracked games`)
    return trackedGames
    
  } catch (error) {
    console.error('❌ Error updating game scores:', error)
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
 * Check if the API is accessible
 */
export async function testApiConnection(): Promise<boolean> {
  try {
    if (!API_KEY) {
      console.warn('⚠️ No CFBD API key found. Set VITE_CFBD_API_KEY environment variable.')
      return false
    }
    
    const response = await fetch(`${BASE_URL}/teams?year=2024`, { 
      method: 'GET',
      headers: getHeaders()
    })
    
    if (response.status === 401) {
      console.error('❌ API key is invalid or missing. Get a free key at https://collegefootballdata.com/')
      return false
    }
    
    return response.ok
  } catch (error) {
    console.error('❌ API connection test failed:', error)
    return false
  }
}