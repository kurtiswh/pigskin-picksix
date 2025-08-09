export interface UserEmail {
  email: string
  type: 'primary' | 'leaguesafe' | 'alternate'
  verified: boolean
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
  created_at: string
  updated_at: string
  preferences?: UserPreferences
  all_emails?: UserEmail[]
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
}

export interface Game {
  id: string
  week: number
  season: number
  home_team: string
  away_team: string
  home_score?: number
  away_score?: number
  spread: number
  kickoff_time: string
  custom_lock_time?: string
  status: 'scheduled' | 'in_progress' | 'completed'
  created_at: string
  updated_at: string
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

export interface LeaderboardEntry {
  user_id: string
  display_name: string
  weekly_record: string
  season_record: string
  lock_record: string
  weekly_points: number
  season_points: number
  weekly_rank: number
  season_rank: number
  best_finish_rank?: number
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
  payment_status?: 'Paid' | 'NotPaid' | 'Pending' | 'No Payment'
  leaguesafe_payment?: LeagueSafePayment
}

export interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  setupExistingUser: (email: string, password: string) => Promise<any>
  signOut: () => Promise<void>
  signInWithGoogle: () => Promise<void>
  refreshUser: () => Promise<void>
}