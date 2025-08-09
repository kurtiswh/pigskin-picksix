import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log('🔧 Supabase Config Debug:')
console.log('URL:', supabaseUrl ? 'Present' : 'Missing', supabaseUrl?.slice(0, 20) + '...')
console.log('Key:', supabaseAnonKey ? 'Present' : 'Missing', supabaseAnonKey?.slice(0, 20) + '...')

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables')
  console.error('URL:', supabaseUrl)
  console.error('Key:', supabaseAnonKey)
  throw new Error('Missing Supabase environment variables')
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