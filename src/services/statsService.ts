import { supabase } from '@/lib/supabase'

export interface CareerStats {
  user_id: string
  display_name: string
  seasons_played: number
  career_points: number
  avg_season_points: number
  career_wins: number
  career_losses: number
  career_pushes: number
  win_pct: number | null
  career_lock_wins: number
  career_lock_losses: number
  lock_win_pct: number | null
  best_finish: number
  avg_finish: number
  best_season_points: number
  top3_finishes: number
  top10_finishes: number
  championships: number
  runner_ups: number
  best_finish_titles: number
  lock_titles: number
  weekly_wins: number
}

export class StatsService {
  static async getAllCareerStats(): Promise<CareerStats[]> {
    const { data, error } = await supabase.from('player_career_stats').select('*')
    if (error) { console.error('getAllCareerStats failed:', error); return [] }
    return (data || []) as CareerStats[]
  }

  static async getCareerStats(userId: string): Promise<CareerStats | null> {
    const { data, error } = await supabase
      .from('player_career_stats').select('*').eq('user_id', userId).maybeSingle()
    if (error) { console.error('getCareerStats failed:', error); return null }
    return (data as CareerStats) || null
  }

  static async getBiggestWeeks(limit = 10): Promise<BiggestWeek[]> {
    const { data, error } = await supabase
      .from('stat_biggest_weeks').select('*').order('points', { ascending: false }).limit(limit)
    if (error) { console.error('getBiggestWeeks failed:', error); return [] }
    return (data || []) as BiggestWeek[]
  }

  static async getTeamAts(): Promise<TeamAts[]> {
    const { data, error } = await supabase.from('stat_team_ats').select('*')
    if (error) { console.error('getTeamAts failed:', error); return [] }
    return (data || []) as TeamAts[]
  }
}

export interface BiggestWeek {
  user_id: string
  display_name: string
  season: number
  week: number
  points: number
  wins: number
  losses: number
}

export interface TeamAts {
  team: string
  times_picked: number
  wins: number
  losses: number
  pushes: number
  win_pct: number | null
}
