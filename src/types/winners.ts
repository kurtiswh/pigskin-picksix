export interface WeeklyWinner {
  week: number
  user_id: string
  display_name?: string
  total_points?: number
}

export interface SeasonWinners {
  id: string
  season: number

  // Point winners
  point_winner_user_id?: string | null
  point_second_user_id?: string | null
  point_third_user_id?: string | null
  point_fourth_user_id?: string | null
  point_fifth_user_id?: string | null
  point_sixth_user_id?: string | null
  point_seventh_user_id?: string | null
  point_eighth_user_id?: string | null
  point_ninth_user_id?: string | null
  point_tenth_user_id?: string | null

  // Lock winners
  lock_winner_user_id?: string | null
  lock_second_user_id?: string | null

  // Bracket winners (admin managed)
  bracket_winner_user_id?: string | null
  bracket_second_user_id?: string | null

  // Best Finish winner
  best_finish_user_id?: string | null

  // Weekly winners array
  weekly_winners?: WeeklyWinner[]

  // Metadata
  total_pot?: number | null
  weekly_payout?: number
  is_finalized: boolean
  created_at: string
  updated_at: string
}

export interface WinnerDisplay {
  category: string
  user_id?: string | null
  display_name?: string
  percentage?: string
  amount?: number
  notes?: string
}

export interface PayoutStructure {
  point_winner: number // 32%
  point_second: number // 20%
  point_third: number // 12%
  point_fourth: number // 8%
  point_fifth: number // 5.5%
  point_sixth: number // 4%
  point_seventh: number // 3%
  point_eighth: number // 2.5%
  point_ninth: number // 2%
  point_tenth: number // 1.5%
  lock_winner: number // 4.5%
  lock_second: number // 1.5%
  bracket_winner: number // 2%
  bracket_second: number // 0.5%
  best_finish: number // 1%
  weekly_winner: number // $80 per week
}

export const PAYOUT_PERCENTAGES: PayoutStructure = {
  point_winner: 32.0,
  point_second: 20.0,
  point_third: 12.0,
  point_fourth: 8.0,
  point_fifth: 5.5,
  point_sixth: 4.0,
  point_seventh: 3.0,
  point_eighth: 2.5,
  point_ninth: 2.0,
  point_tenth: 1.5,
  lock_winner: 4.5,
  lock_second: 1.5,
  bracket_winner: 2.0,
  bracket_second: 0.5,
  best_finish: 1.0,
  weekly_winner: 80.0 // Dollar amount per week
}
