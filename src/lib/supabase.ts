import { createClient } from '@supabase/supabase-js'
import { ENV, validateRequiredEnvVars } from './env'

const supabaseUrl = ENV.SUPABASE_URL
const supabaseAnonKey = ENV.SUPABASE_ANON_KEY

console.log('🔧 Supabase Config Debug:')
console.log('URL:', supabaseUrl ? 'Present' : 'Missing', supabaseUrl?.slice(0, 30) + '...')
console.log('Key:', supabaseAnonKey ? 'Present' : 'Missing', supabaseAnonKey?.slice(0, 20) + '...')

// Validate required environment variables
const envValidation = validateRequiredEnvVars()
if (!envValidation.valid) {
  console.error('❌ Missing required Supabase environment variables:', envValidation.missing)
  console.error('Available env methods:')
  console.error('- import.meta.env:', typeof import.meta !== 'undefined' && !!import.meta.env)
  console.error('- process.env:', typeof process !== 'undefined' && !!process.env)
  console.error('- Current URL:', supabaseUrl)
  console.error('- Current Key:', supabaseAnonKey)
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(`Missing Supabase environment variables: ${envValidation.missing.join(', ')}`)
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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