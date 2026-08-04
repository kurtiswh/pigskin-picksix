import { supabase } from '@/lib/supabase'

/**
 * Self-service email claims.
 *
 * A player who paid LeagueSafe under an old address proves they control it by
 * entering a code we email to that address. On success the server records a
 * verified user_emails row, links any unmatched payments made under it, and
 * folds in the import-created placeholder account that was holding it.
 *
 * Both calls are thin wrappers over SECURITY DEFINER RPCs (migration 190) —
 * the code itself is generated and delivered server-side and never reaches the
 * browser, which is the whole point of the round trip.
 */

export type ClaimRequestStatus =
  | 'sent'
  | 'not_enabled'
  | 'invalid_email'
  | 'own_email'
  | 'already_linked'
  | 'blocked'
  | 'rate_limited'

export type AddEmailStatus =
  | 'added'
  | 'already_added'
  | 'invalid_email'
  | 'own_email'
  | 'blocked'
  | 'claimed_by_other'

export interface PlayerLookup {
  found: boolean
  user_id?: string
  display_name?: string
  matched_via?: 'account' | 'profile' | 'payment' | 'payment_history'
  payment_status?: string | null
  paid?: boolean
}

export interface MyPaymentStatus {
  found: boolean
  /** Payment is attached to this account (counts on the leaderboards). */
  linked?: boolean
  payment_status?: string | null
  paid?: boolean
  matched_email?: string | null
}

export interface ClaimRequestResult {
  status: ClaimRequestStatus
  email?: string
  expires_at?: string
  /** An older (never-signed-in) account holds this address and will be merged in. */
  merge_pending?: boolean
}

export type ClaimVerifyStatus =
  | 'verified'
  | 'no_pending'
  | 'expired'
  | 'bad_code'
  | 'too_many_attempts'
  | 'blocked'

export interface ClaimVerifyResult {
  status: ClaimVerifyStatus
  email?: string
  attempts_left?: number
  payments_linked?: number
  seasons?: number[]
  season_conflicts?: number[]
  merged_account?: string | null
  merge_result?: {
    picks_merged?: number
    payments_merged?: number
    anonymous_picks_merged?: number
  } | null
}

export interface LinkedEmail {
  id: string
  email: string
  email_type: string
  is_verified: boolean
  verified_at: string | null
  source: string | null
}

export class EmailClaimService {
  /**
   * The everyday path: put a LeagueSafe address on your profile so pick
   * submission recognizes you. Records the address only — payments are not
   * moved until it's confirmed by code or linked by an admin.
   */
  static async addLeagueSafeEmail(email: string): Promise<{ status: AddEmailStatus; email?: string }> {
    const { data, error } = await supabase.rpc('add_my_leaguesafe_email', {
      p_email: email.trim().toLowerCase(),
    })
    if (error) throw error
    return data as { status: AddEmailStatus; email?: string }
  }

  /** Resolve any email — sign-in, LeagueSafe, or profile — to a player + payment. */
  static async lookupByEmail(email: string, season: number): Promise<PlayerLookup> {
    const { data, error } = await supabase.rpc('lookup_player_by_email', {
      p_email: email.trim().toLowerCase(),
      p_season: season,
    })
    if (error) throw error
    return data as PlayerLookup
  }

  /** Signed-in player's payment for a season, across every email on the profile. */
  static async myPaymentStatus(season: number): Promise<MyPaymentStatus> {
    const { data, error } = await supabase.rpc('my_payment_status', { p_season: season })
    if (error) throw error
    return data as MyPaymentStatus
  }

  /** Email a confirmation code to the address being claimed. */
  static async requestClaim(email: string): Promise<ClaimRequestResult> {
    const { data, error } = await supabase.rpc('request_email_claim', {
      p_email: email.trim().toLowerCase(),
    })
    if (error) throw error
    return data as ClaimRequestResult
  }

  /** Confirm the code and link everything that address owns. */
  static async verifyClaim(email: string, code: string): Promise<ClaimVerifyResult> {
    const { data, error } = await supabase.rpc('verify_email_claim', {
      p_email: email.trim().toLowerCase(),
      p_code: code.trim(),
    })
    if (error) throw error
    return data as ClaimVerifyResult
  }

  /** Every address linked to this account, newest first. */
  static async getLinkedEmails(userId: string): Promise<LinkedEmail[]> {
    const { data, error } = await supabase
      .from('user_emails')
      .select('id, email, email_type, is_verified, verified_at, source')
      .eq('user_id', userId)
      .order('verified_at', { ascending: false, nullsFirst: false })
    if (error) {
      // Table missing or read blocked — the claim flow still works, we just
      // can't show the list.
      console.warn('Could not load linked emails:', error.message)
      return []
    }
    return data || []
  }

  /** Drop an alternate address the player no longer wants attached. */
  static async removeEmail(id: string): Promise<void> {
    const { error } = await supabase.from('user_emails').delete().eq('id', id)
    if (error) throw error
  }
}
