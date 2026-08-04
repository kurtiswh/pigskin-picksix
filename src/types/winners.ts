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
  // Places 11-15 pay from 2026 on (see PAYOUT_2026); null for earlier seasons.
  point_eleventh_user_id?: string | null
  point_twelfth_user_id?: string | null
  point_thirteenth_user_id?: string | null
  point_fourteenth_user_id?: string | null
  point_fifteenth_user_id?: string | null

  // Lock winners
  lock_winner_user_id?: string | null
  lock_second_user_id?: string | null
  lock_is_tied?: boolean

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

/**
 * Payout percentages for one season. Percentages are of the pot AFTER the
 * weekly-winner money (weekly_winner × weeks) is set aside; every structure
 * below sums to 100.
 *
 * Places 11-15 are optional because they only started paying in 2026 — a
 * structure that omits them simply doesn't render those rows.
 */
export interface PayoutStructure {
  point_winner: number
  point_second: number
  point_third: number
  point_fourth: number
  point_fifth: number
  point_sixth: number
  point_seventh: number
  point_eighth: number
  point_ninth: number
  point_tenth: number
  point_eleventh?: number
  point_twelfth?: number
  point_thirteenth?: number
  point_fourteenth?: number
  point_fifteenth?: number
  lock_winner: number
  lock_second: number
  bracket_winner: number
  bracket_second: number
  best_finish: number
  weekly_winner: number // Dollar amount per week
  weeks: number // Regular-season weeks the weekly payout covers
}

/** 2006-2025: ten point places, 14 weeks. */
export const PAYOUT_LEGACY: PayoutStructure = {
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
  weekly_winner: 80.0,
  weeks: 14
}

/** 2026 official rules: fifteen point places, 13 weeks ($1,040 weekly pool). */
export const PAYOUT_2026: PayoutStructure = {
  point_winner: 27.0,
  point_second: 17.5,
  point_third: 12.0,
  point_fourth: 8.5,
  point_fifth: 6.5,
  point_sixth: 5.0,
  point_seventh: 4.0,
  point_eighth: 3.0,
  point_ninth: 2.25,
  point_tenth: 1.75,
  point_eleventh: 1.5,
  point_twelfth: 1.25,
  point_thirteenth: 1.0,
  point_fourteenth: 0.75,
  point_fifteenth: 0.5,
  lock_winner: 3.0,
  lock_second: 1.5,
  bracket_winner: 1.5,
  bracket_second: 0.5,
  best_finish: 1.0,
  weekly_winner: 80.0,
  weeks: 13
}

/**
 * The payout structure in force for a season. Historic seasons must keep their
 * own numbers — the Hall of Champions renders payouts for finished seasons.
 */
export function getPayoutStructure(season: number): PayoutStructure {
  return season >= 2026 ? PAYOUT_2026 : PAYOUT_LEGACY
}

/** Ordered point places, skipping the ones a structure doesn't pay. */
export const POINT_PLACES: {
  key: keyof PayoutStructure
  column: keyof SeasonWinners
  place: string
}[] = [
  { key: 'point_winner', column: 'point_winner_user_id', place: '1st' },
  { key: 'point_second', column: 'point_second_user_id', place: '2nd' },
  { key: 'point_third', column: 'point_third_user_id', place: '3rd' },
  { key: 'point_fourth', column: 'point_fourth_user_id', place: '4th' },
  { key: 'point_fifth', column: 'point_fifth_user_id', place: '5th' },
  { key: 'point_sixth', column: 'point_sixth_user_id', place: '6th' },
  { key: 'point_seventh', column: 'point_seventh_user_id', place: '7th' },
  { key: 'point_eighth', column: 'point_eighth_user_id', place: '8th' },
  { key: 'point_ninth', column: 'point_ninth_user_id', place: '9th' },
  { key: 'point_tenth', column: 'point_tenth_user_id', place: '10th' },
  { key: 'point_eleventh', column: 'point_eleventh_user_id', place: '11th' },
  { key: 'point_twelfth', column: 'point_twelfth_user_id', place: '12th' },
  { key: 'point_thirteenth', column: 'point_thirteenth_user_id', place: '13th' },
  { key: 'point_fourteenth', column: 'point_fourteenth_user_id', place: '14th' },
  { key: 'point_fifteenth', column: 'point_fifteenth_user_id', place: '15th' },
]

/**
 * @deprecated Use getPayoutStructure(season) — a bare constant can't be right
 * for both the pre-2026 and 2026 structures.
 */
export const PAYOUT_PERCENTAGES: PayoutStructure = PAYOUT_LEGACY
