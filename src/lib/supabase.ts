import { createClient } from '@supabase/supabase-js'
import { ENV } from './env'

const supabaseUrl = ENV.SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = ENV.SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'public'
  },
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    // Enhanced PKCE configuration to handle auth errors better
    storage: {
      getItem: (key) => {
        if (typeof window !== 'undefined') {
          return window.localStorage.getItem(key)
        }
        return null
      },
      setItem: (key, value) => {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, value)
        }
      },
      removeItem: (key) => {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(key)
        }
      }
    },
    // Debug auth issues
    debug: process.env.NODE_ENV === 'development'
  },
  global: {
    headers: {
      'x-application-name': 'pigskin-pick-six-pro'
    }
    // Temporarily disable custom fetch to test if it interferes with auth
    // fetch: (url, options = {}) => {
    //   // Create manual timeout using AbortController (universally supported)
    //   const controller = new AbortController()
    //   const timeoutId = setTimeout(() => {
    //     controller.abort()
    //   }, 30000) // 30 second timeout for database queries

    //   // If original options had a signal, we need to handle both
    //   if (options.signal) {
    //     const originalSignal = options.signal
    //     const handleAbort = () => {
    //       clearTimeout(timeoutId)
    //       controller.abort()
    //     }
    //     originalSignal.addEventListener('abort', handleAbort)
    //   }

    //   return fetch(url, {
    //     ...options,
    //     signal: controller.signal
    //   }).finally(() => {
    //     clearTimeout(timeoutId)
    //   })
    // }
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
})

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          display_name: string
          is_admin: boolean
          leaguesafe_email: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          display_name: string
          is_admin?: boolean
          leaguesafe_email?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          display_name?: string
          is_admin?: boolean
          leaguesafe_email?: string | null
          updated_at?: string
        }
      }
      games: {
        Row: {
          id: string
          week: number
          season: number
          home_team: string
          away_team: string
          home_score: number | null
          away_score: number | null
          spread: number
          kickoff_time: string
          status: 'scheduled' | 'in_progress' | 'completed'
          created_at: string
          updated_at: string
          home_team_picks: number
          home_team_locks: number
          away_team_picks: number
          away_team_locks: number
          total_picks: number
          pick_stats_updated_at: string | null
        }
        Insert: {
          id?: string
          week: number
          season: number
          home_team: string
          away_team: string
          home_score?: number | null
          away_score?: number | null
          spread: number
          kickoff_time: string
          status?: 'scheduled' | 'in_progress' | 'completed'
          created_at?: string
          updated_at?: string
          home_team_picks?: number
          home_team_locks?: number
          away_team_picks?: number
          away_team_locks?: number
          total_picks?: number
          pick_stats_updated_at?: string | null
        }
        Update: {
          id?: string
          week?: number
          season?: number
          home_team?: string
          away_team?: string
          home_score?: number | null
          away_score?: number | null
          spread?: number
          kickoff_time?: string
          status?: 'scheduled' | 'in_progress' | 'completed'
          updated_at?: string
          home_team_picks?: number
          home_team_locks?: number
          away_team_picks?: number
          away_team_locks?: number
          total_picks?: number
          pick_stats_updated_at?: string | null
        }
      }
      picks: {
        Row: {
          id: string
          user_id: string
          game_id: string
          week: number
          season: number
          selected_team: string
          is_lock: boolean
          result: 'win' | 'loss' | 'push' | null
          points_earned: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          game_id: string
          week: number
          season: number
          selected_team: string
          is_lock?: boolean
          result?: 'win' | 'loss' | 'push' | null
          points_earned?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          game_id?: string
          week?: number
          season?: number
          selected_team?: string
          is_lock?: boolean
          result?: 'win' | 'loss' | 'push' | null
          points_earned?: number | null
          updated_at?: string
        }
      }
      week_settings: {
        Row: {
          id: string
          week: number
          season: number
          games_selected: boolean
          picks_open: boolean
          games_locked: boolean
          deadline: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          week: number
          season: number
          games_selected?: boolean
          picks_open?: boolean
          games_locked?: boolean
          deadline: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          week?: number
          season?: number
          games_selected?: boolean
          picks_open?: boolean
          games_locked?: boolean
          deadline?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}