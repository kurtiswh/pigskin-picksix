// Direct Supabase REST API calls to bypass potential client issues
import { ENV } from './env'

const supabaseUrl = ENV.SUPABASE_URL
const supabaseKey = ENV.SUPABASE_ANON_KEY

interface DirectQueryOptions {
  timeout?: number
  headers?: Record<string, string>
}

// Direct REST API helper that bypasses the Supabase JavaScript client
export async function directSupabaseQuery(
  table: string, 
  params: Record<string, any> = {}, 
  options: DirectQueryOptions = {}
): Promise<any> {
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials')
  }

  const { timeout = 15000, headers = {} } = options
  
  // Build query string
  const queryParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      queryParams.append(key, String(value))
    }
  })
  
  const url = `${supabaseUrl}/rest/v1/${table}${queryParams.toString() ? '?' + queryParams.toString() : ''}`
  
  console.log(`🔗 Direct API call: ${url}`)
  
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...headers
      },
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }
    
    const data = await response.json()
    console.log(`✅ Direct API success: ${data.length || 'N/A'} rows`)
    return data
    
  } catch (error) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error(`Direct API timeout after ${timeout}ms`)
    }
    throw error
  }
}

// Specific helper for admin dashboard queries that are timing out
export async function getWeekDataDirect(week: number, season: number) {
  console.log(`📊 Loading week ${week} data directly via REST API...`)
  
  try {
    // Get week settings
    const weekSettings = await directSupabaseQuery('week_settings', {
      week: `eq.${week}`,
      season: `eq.${season}`,
      limit: 1
    })
    
    // Get games for this week  
    const games = await directSupabaseQuery('games', {
      week: `eq.${week}`,
      season: `eq.${season}`,
      order: 'kickoff_time.asc'
    })
    
    console.log(`✅ Direct week data loaded: ${weekSettings.length} settings, ${games.length} games`)
    
    // Debug custom lock times in loaded games
    console.log('📊 Loaded games with custom lock times (direct API):', games.map(g => ({
      matchup: `${g.home_team} vs ${g.away_team}`,
      custom_lock_time: g.custom_lock_time,
      hasCustomLockTime: !!g.custom_lock_time
    })))
    
    return {
      weekSettings: weekSettings[0] || null,
      games: games || []
    }
    
  } catch (error) {
    console.error('❌ Direct week data failed:', error)
    throw error
  }
}

// Helper for unsaving games directly via REST API
// This should NOT delete games, just change the games_selected flag
export async function unsaveGamesDirect(week: number, season: number) {
  console.log(`🔄 Unsaving games for week ${week} season ${season} via direct API (preserving games, just changing status)...`)
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 20000)
  
  try {
    // Get current week settings to preserve deadline
    const getResponse = await fetch(`${supabaseUrl}/rest/v1/week_settings?week=eq.${week}&season=eq.${season}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    })
    
    const existingSettings = await getResponse.json()
    console.log('📋 Current week settings before unsave:', existingSettings)
    
    if (existingSettings && existingSettings.length > 0) {
      // Update week settings to unsave games but preserve deadline
      const updateResponse = await fetch(`${supabaseUrl}/rest/v1/week_settings?week=eq.${week}&season=eq.${season}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          games_selected: false,
          picks_open: false,
          games_locked: false
          // Deliberately NOT updating deadline - preserve it
        }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!updateResponse.ok) {
        const errorText = await updateResponse.text()
        throw new Error(`Unsave failed HTTP ${updateResponse.status}: ${errorText}`)
      }
      
      const updatedSettings = await updateResponse.json()
      console.log('✅ Games unsaved successfully via direct API (games preserved, deadline retained):', updatedSettings)
      return updatedSettings
    } else {
      throw new Error('No week settings found to unsave')
    }
    
  } catch (error) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error('Unsave operation timed out after 20 seconds')
    }
    throw error
  }
}

// Helper for saving games directly via REST API
export async function saveGamesDirect(games: any[], week: number, season: number) {
  console.log(`💾 Saving ${games.length} games directly via REST API...`)
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 20000)
  
  try {
    // Insert games
    const response = await fetch(`${supabaseUrl}/rest/v1/games`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(games),
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Save failed HTTP ${response.status}: ${errorText}`)
    }
    
    console.log('✅ Games saved successfully via direct API')
    return true
    
  } catch (error) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error('Save operation timed out after 20 seconds')
    }
    throw error
  }
}