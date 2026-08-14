export interface UserEmail {
  id?: string
  user_id?: string
  email: string
  email_type: 'primary' | 'leaguesafe' | 'alternate' | 'merged'
  is_primary: boolean
  is_verified: boolean
  verified_at?: string | null
  source?: string | null
  source_user_id?: string | null
  added_at?: string
  added_by?: string | null
  season_used?: number[] | null
  notes?: string | null
  created_at?: string
  updated_at?: string
}

export interface UserPreferences {
  email_notifications: boolean
  pick_reminders: boolean
  weekly_results: boolean
  deadline_alerts: boolean
  compact_view: boolean
}

export interface User {
  id: string
  email: string
  display_name: string
  is_admin: boolean
  leaguesafe_email?: string
  /**
   * They told us they paid LeagueSafe under this same sign-in address, so the
   * post-sign-in prompt stops asking. (migration 196)
   */
  leaguesafe_email_confirmed_at?: string | null
  created_at: string
  updated_at: string
  preferences?: UserPreferences
  emails?: UserEmail[]
  merge_history?: UserMergeHistory[]
}

export interface UserMergeHistory {
  id: string
  target_user_id: string
  source_user_id: string
  source_user_email: string
  source_user_display_name: string
  merged_by: string
  merge_type: 'full' | 'partial' | 'email_only'
  picks_merged: number
  payments_merged: number
  anonymous_picks_merged: number
  emails_merged: number
  conflicts_detected: boolean
  conflict_resolution?: any
  merge_reason?: string
  notes?: string
  merged_at: string
}

export interface UserProfile extends User {
  stats?: {
    seasons_played: number
    total_picks: number
    total_wins: number
    total_losses: number
    total_pushes: number
    best_week_score: number
    best_season_rank: number
    lock_wins: number
    lock_losses: number
    current_season_points: number
  }
  pickSets?: UserPickSet[]
}

export interface UserPickSet {
  season: number
  week: number
  pickType: 'authenticated' | 'anonymous'
  isActive: boolean
  pickCount: number
  wins: number
  losses: number
  pushes: number
  points: number
  lockWins?: number
  lockLosses?: number
  conflictStatus?: 'no_conflict' | 'resolved_conflict' | 'active_conflict'
  submitted?: boolean
  submitted_at?: string
  admin_note?: string
  picks?: PickDetail[]
}

export interface PickDetail {
  team: string
  opponent: string | null
  isHome: boolean
  spread: number | null       // from the picked team's perspective
  teamScore: number | null
  oppScore: number | null
  result: 'win' | 'loss' | 'push' | null
  is_lock: boolean
  points: number
}

export type GameStatus = 'scheduled' | 'in_progress' | 'completed'

/**
 * A row of public.games.
 *
 * This mirrors the table column for column. It used to be one of SIX competing
 * Game interfaces — this one plus a hand-written copy in GameResultCard,
 * GamesList, GamesPage, GameStatsOverview and PickStatsWidget — and they had
 * drifted from the schema and from each other. This copy had home_ranking and
 * away_ranking, which are not columns; the columns are home_team_ranking and
 * away_team_ranking, so any component using the shared type could not read the
 * rankings at all. Two of the local copies declared home_conference and
 * away_conference, which do not exist on this table either (they come from the
 * CollegeFootballData API shape used when picking games) and were never read.
 *
 * Nullable columns are `?: T | null`: optional because plenty of call sites do a
 * partial select, and null because that is what Postgres returns for them.
 */
export interface Game {
  // NOT NULL in the schema
  id: string
  week: number
  season: number
  home_team: string
  away_team: string
  spread: number
  kickoff_time: string

  home_score?: number | null
  away_score?: number | null
  status?: GameStatus | null
  created_at?: string | null
  updated_at?: string | null
  custom_lock_time?: string | null

  // Scoring
  base_points?: number | null
  margin_bonus?: number | null
  winner_against_spread?: string | null
  favorite_team?: string | null
  home_covered?: boolean | null
  away_covered?: boolean | null

  // Presentation
  home_team_ranking?: number | null
  away_team_ranking?: number | null
  neutral_site?: boolean | null
  venue?: string | null

  // Live scoring, straight off the provider
  api_home_points?: number | null
  api_away_points?: number | null
  api_clock?: string | null
  api_period?: number | null
  api_completed?: boolean | null
  game_period?: number | null
  game_clock?: string | null

  // Pick statistics
  home_team_picks?: number | null
  home_team_locks?: number | null
  away_team_picks?: number | null
  away_team_locks?: number | null
  total_picks?: number | null
  pick_stats_updated_at?: string | null
  home_pick_percentage?: number | null
  away_pick_percentage?: number | null
}

export interface Pick {
  id: string
  user_id: string
  game_id: string
  week: number
  season: number
  selected_team: string
  is_lock: boolean
  submitted: boolean
  submitted_at?: string
  result?: 'win' | 'loss' | 'push'
  points_earned?: number
  admin_note?: string
  created_at: string
  updated_at: string
}

export interface AnonymousPick {
  id: string
  email: string
  name: string
  week: number
  season: number
  game_id: string
  home_team: string
  away_team: string
  selected_team: string
  is_lock: boolean
  confidence?: number
  assigned_user_id?: string
  show_on_leaderboard: boolean
  validation_status: 'pending' | 'validated' | 'auto-validated' | 'rejected'
  result?: 'win' | 'loss' | 'push'
  points_earned?: number
  submitted: boolean
  submitted_at?: string
  admin_note?: string
  is_active_pick_set: boolean
  created_at: string
  updated_at: string
}

export interface WeekSettings {
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

/**
 * A leaderboard row as LeaderboardService produces it.
 *
 * Was declared three times — here, in leaderboardService, and locally in
 * LeaderboardTable — with this copy the narrowest of the three. The table reads
 * rank_change and previous_rank to draw its movement arrows, and neither existed
 * on the copy the page importing from '@/types' was checked against.
 */
export interface LeaderboardEntry {
  user_id: string
  display_name: string
  weekly_record?: string
  season_record: string
  lock_record: string
  weekly_points?: number
  season_points: number
  weekly_rank?: number
  season_rank: number
  best_finish_rank?: number
  total_picks: number
  total_wins: number
  total_losses: number
  total_pushes: number
  lock_wins: number
  lock_losses: number
  lock_pushes: number
  last_week_points?: number
  trend?: 'up' | 'down' | 'same'
  /** Positive means moved up the board since last week. */
  rank_change?: number
  previous_rank?: number
  live_calculated?: boolean
  pick_source?: 'authenticated' | 'anonymous' | 'mixed'
}

export interface PickDistribution {
  game_id: string
  home_team: string
  away_team: string
  spread: number
  home_picks: number
  away_picks: number
  total_picks: number
  lock_picks: number
}

export interface LeagueSafePayment {
  id: string
  user_id?: string
  season: number
  leaguesafe_owner_name: string
  leaguesafe_email: string
  leaguesafe_owner_id?: string
  entry_fee: number
  paid: number
  pending: number
  owes: number
  status: 'Paid' | 'NotPaid' | 'Pending'
  is_matched: boolean
  created_at: string
  updated_at: string
}

export interface UserWithPayment extends User {
  payment_status?: 'Paid' | 'NotPaid' | 'Pending' | 'No Payment' | 'Manual Registration'
  leaguesafe_payment?: LeagueSafePayment
  season_payment_history?: LeagueSafePayment[]
}

/**
 * Result of a signup attempt. `existingAccount` is true when Supabase returned
 * its anti-enumeration response for an address that already has an account —
 * see signUp() in useAuth. Callers must NOT surface this distinction in the UI:
 * both outcomes get the same message, or the register page becomes an oracle
 * for which emails are registered.
 */
export interface SignUpOutcome {
  existingAccount: boolean
}

export interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string) => Promise<SignUpOutcome>
  signOut: () => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithMagicLink: (email: string) => Promise<any>
  refreshUser: () => Promise<void>
}

// Blog types live in ./blog and are re-exported here, because most callers
// import from '@/types'. They used to be declared in both places and the copies
// had drifted: this one was missing attachments, email_rundown and emailed_at,
// so the recap editor could not typecheck against the very columns it writes.
export type {
  BlogAttachment,
  BlogPost,
  BlogPostCreate,
  BlogPostUpdate,
  WeekOption,
  SeasonWeekFilter,
} from './blog'