/**
 * Canonical leaderboard type definitions.
 *
 * These were previously defined inside leaderboardService.emergency.ts and
 * weeklyLeaderboardService.emergency.ts. They are centralized here so the
 * components that consume them (TabbedLeaderboard, SeasonExpandedDetails,
 * WeeklyExpandedDetails) can depend on stable types as the service layer is
 * consolidated. The original service files re-export these for back-compat.
 */

export interface EmergencyLeaderboardEntry {
  user_id: string
  display_name: string
  season_rank: number
  total_points: number
  season_record: string
  lock_record: string
  total_wins?: number
  total_losses?: number
  total_pushes?: number
  lock_wins?: number
  lock_losses?: number
  pick_source?: 'authenticated' | 'anonymous' | 'mixed'
  payment_status?: 'Paid' | 'NotPaid' | 'Pending'
  is_verified?: boolean
}

export interface WeeklyPerformance {
  week: number
  points: number
  record: string // "W-L-P" format
  lock_record: string // "W-L" format
  picks_made: number
  best_week?: boolean // Flag for highlighting best performance
}

export interface UserWeeklyBreakdown {
  user_id: string
  display_name: string
  weeks: WeeklyPerformance[]
}

export interface EmergencyWeeklyLeaderboardEntry {
  user_id: string
  display_name: string
  weekly_rank: number
  total_points: number
  weekly_record: string
  lock_record: string
  week: number
  wins?: number
  losses?: number
  pushes?: number
  lock_wins?: number
  lock_losses?: number
  lock_pushes?: number
  pick_source?: 'authenticated' | 'anonymous' | 'mixed'
  payment_status?: 'Paid' | 'NotPaid' | 'Pending'
  is_verified?: boolean
}

export interface WeeklyPickDetail {
  game_id: string
  game_name: string  // "Team A @ Team B"
  selected_team: string
  is_lock: boolean
  result: 'win' | 'loss' | 'push' | null
  points_earned: number
  game_status: 'scheduled' | 'in_progress' | 'completed'
  kickoff_time: string
}

export interface UserWeeklyPicks {
  user_id: string
  display_name: string
  week: number
  season: number
  picks: WeeklyPickDetail[]
  total_points: number
  weekly_record: string
  lock_record: string
}
