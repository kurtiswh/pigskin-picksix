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
  total_players?: number
  career_points_rank?: number
  avg_season_points_rank?: number
  win_pct_rank?: number
  lock_win_pct_rank?: number
  avg_finish_rank?: number
  championships_rank?: number
  weekly_wins_rank?: number
  top10_finishes_rank?: number
  seasons_played_rank?: number
}

export class StatsService {
  /** Top-N players for a career-stats column (server-side ordered — avoids the
   *  1000-row response cap that a client-side "fetch all + sort" would hit). */
  static async getTopCareer(column: string, ascending: boolean, minSeasons = 1, limit = 10): Promise<CareerStats[]> {
    let q = supabase.from('player_career_stats').select('*').not(column, 'is', null)
    if (minSeasons > 1) q = q.gte('seasons_played', minSeasons)
    const { data, error } = await q.order(column, { ascending }).limit(limit)
    if (error) { console.error(`getTopCareer(${column}) failed:`, error); return [] }
    return (data || []) as CareerStats[]
  }

  static async getCareerStats(userId: string): Promise<CareerStats | null> {
    const { data, error } = await supabase
      .from('player_career_stats').select('*').eq('user_id', userId).maybeSingle()
    if (error) { console.error('getCareerStats failed:', error); return null }
    return (data as CareerStats) || null
  }

  /** Per-season finishes + awards + field size for one player, newest first. */
  static async getSeasonHistory(userId: string): Promise<SeasonHistoryRow[]> {
    const [finRes, winRes, entRes] = await Promise.all([
      supabase.from('all_season_finishes').select('*').eq('user_id', userId),
      supabase.from('season_winners').select(
        'season, point_winner_user_id, point_second_user_id, point_third_user_id, ' +
        'best_finish_user_id, lock_winner_user_id, lock_second_user_id, weekly_winners'),
      supabase.from('season_entrant_counts').select('season, entrants'),
    ])
    if (finRes.error) { console.error('getSeasonHistory failed:', finRes.error); return [] }
    const winsBySeason = new Map<number, any>((winRes.data || []).map((w: any) => [w.season, w]))
    const entrantsBySeason = new Map<number, number>((entRes.data || []).map((e: any) => [e.season, e.entrants]))

    return ((finRes.data || []) as any[]).map(f => {
      const w = winsBySeason.get(f.season)
      const awards: string[] = []
      if (w) {
        if (w.point_winner_user_id === userId) awards.push('🏆 Champion')
        else if (w.point_second_user_id === userId) awards.push('2nd')
        else if (w.point_third_user_id === userId) awards.push('3rd')
        if (w.best_finish_user_id === userId) awards.push('Best Finish')
        if (w.lock_winner_user_id === userId) awards.push('Lock Winner')
        else if (w.lock_second_user_id === userId) awards.push('Lock 2nd')
        const wk = (w.weekly_winners || []).filter((x: any) => x?.user_id === userId).length
        if (wk > 0) awards.push(`${wk} weekly win${wk > 1 ? 's' : ''}`)
      }
      return {
        season: f.season, rank: f.rank, total_points: f.total_points,
        wins: f.wins, losses: f.losses, pushes: f.pushes,
        lock_wins: f.lock_wins, lock_losses: f.lock_losses, awards,
        entrants: entrantsBySeason.get(f.season) ?? null,
      } as SeasonHistoryRow
    }).sort((a, b) => b.season - a.season)
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

  /** Players with the most perfect weeks (all picks won). */
  static async getPerfectWeeks(limit = 10): Promise<PerfectWeeks[]> {
    const { data, error } = await supabase.from('stat_perfect_weeks').select('*')
      .gt('perfect_weeks', 0).order('perfect_weeks', { ascending: false }).limit(limit)
    if (error) { console.error('getPerfectWeeks failed:', error); return [] }
    return (data || []) as PerfectWeeks[]
  }

  /** Players with the most goose-egg weeks (zero wins). */
  static async getGooseEggs(limit = 10): Promise<PerfectWeeks[]> {
    const { data, error } = await supabase.from('stat_perfect_weeks').select('*')
      .gt('goose_weeks', 0).order('goose_weeks', { ascending: false }).limit(limit)
    if (error) { console.error('getGooseEggs failed:', error); return [] }
    return (data || []) as PerfectWeeks[]
  }

  /** Most correct picks made against the field's majority side. */
  static async getContrarian(limit = 10): Promise<Contrarian[]> {
    const { data, error } = await supabase.from('stat_contrarian').select('*')
      .order('contrarian_wins', { ascending: false }).limit(limit)
    if (error) { console.error('getContrarian failed:', error); return [] }
    return (data || []) as Contrarian[]
  }

  /** Field-wide ATS win% by week number (lowest = hardest). */
  static async getWeekDifficulty(): Promise<WeekDifficulty[]> {
    const { data, error } = await supabase.from('stat_week_difficulty').select('*')
      .order('win_pct', { ascending: true })
    if (error) { console.error('getWeekDifficulty failed:', error); return [] }
    return (data || []) as WeekDifficulty[]
  }

  /** The logged-in user's own perfect/goose-week counts + ranks. */
  static async getMyPerfectWeeks(userId: string): Promise<PerfectWeeks | null> {
    const { data, error } = await supabase.from('stat_perfect_weeks').select('*').eq('user_id', userId).maybeSingle()
    if (error) { console.error('getMyPerfectWeeks failed:', error); return null }
    return (data || null) as PerfectWeeks | null
  }

  /** The logged-in user's own contrarian record + rank. */
  static async getMyContrarian(userId: string): Promise<Contrarian | null> {
    const { data, error } = await supabase.from('stat_contrarian').select('*').eq('user_id', userId).maybeSingle()
    if (error) { console.error('getMyContrarian failed:', error); return null }
    return (data || null) as Contrarian | null
  }

  /** All-time hardest specific slates (lowest field ATS%) — e.g. "2016 Week 6". */
  static async getHardestSlates(limit = 8): Promise<WeekSlate[]> {
    const { data, error } = await supabase.from('stat_week_slates').select('*').order('win_pct', { ascending: true }).limit(limit)
    if (error) { console.error('getHardestSlates failed:', error); return [] }
    return (data || []) as WeekSlate[]
  }

  /** All-time easiest specific slates (highest field ATS%). */
  static async getEasiestSlates(limit = 8): Promise<WeekSlate[]> {
    const { data, error } = await supabase.from('stat_week_slates').select('*').order('win_pct', { ascending: false }).limit(limit)
    if (error) { console.error('getEasiestSlates failed:', error); return [] }
    return (data || []) as WeekSlate[]
  }
}

export interface SeasonHistoryRow {
  season: number
  rank: number
  total_points: number
  wins: number
  losses: number
  pushes: number
  lock_wins: number
  lock_losses: number
  awards: string[]
  entrants: number | null
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

export interface PerfectWeeks {
  user_id: string
  display_name: string
  perfect_weeks: number
  goose_weeks: number
  total_players?: number
  perfect_rank?: number
  goose_rank?: number
}

export interface Contrarian {
  user_id: string
  display_name: string
  contrarian_wins: number
  contrarian_picks: number
  total_players?: number
  contrarian_rank?: number
}

export interface WeekDifficulty {
  week: number
  total_picks: number
  win_pct: number | null
  wins: number
  losses: number
}

export interface WeekSlate {
  season: number
  week: number
  total_picks: number
  win_pct: number | null
  wins: number
  losses: number
}
