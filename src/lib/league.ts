/**
 * League-wide constants that change once a season (or once a decade).
 *
 * These live in code — not app_settings — because they're published content
 * (rules, entry fee, LeagueSafe links) that ships with a deploy rather than
 * something an admin flips mid-week. Update them when the new season's rules
 * PDF and LeagueSafe league are ready, then `npm run deploy`.
 */

/** The season these constants describe. */
export const RULES_SEASON = 2026

/** Regular-season weeks that count for picks (2026: Sept 5 – Nov 28). */
export const REGULAR_SEASON_WEEKS = 13

/**
 * LeagueSafe league for {@link RULES_SEASON}. Two different links, two audiences:
 *
 * - JOIN: new players. Creates a LeagueSafe account, joins the league AND pays.
 *   This is the one to hand out publicly.
 * - PAY: players already in the league (returning members LeagueSafe carried
 *   over) who just need to make this year's payment.
 */
export const LEAGUESAFE_JOIN_URL =
  'https://www.leaguesafe.com/join/4449724/pigskin-pick-six-2026'
export const LEAGUESAFE_PAY_URL =
  'https://www.leaguesafe.com/Deposit/MakeAPaymentAfterJoin/4449724'
export const LEAGUESAFE_ABOUT_URL = 'https://leaguesafe.com/about'

/**
 * Where a player looks up which email their LeagueSafe account actually uses —
 * the question behind every mismatched payment. LeagueSafe accounts live under
 * FanBall's wallet, so account settings are there rather than on leaguesafe.com.
 */
export const LEAGUESAFE_ACCOUNT_URL = 'https://wallet.fanball.com/account-settings'

/** Entry fee before / after LeagueSafe's 4% processing fee. */
export const ENTRY_FEE = 40
export const ENTRY_FEE_WITH_FEES = 41.6

/** Deadline to have the entry paid. */
export const ENTRY_DEADLINE_LABEL = 'Saturday, September 5, 2026'

/** Downloadable copy of the official rules (served from /public). */
export const RULES_PDF_PATH = '/rules/pigskin-pick-six-2026-rules.pdf'

/** Where players should write when a payment or email match looks wrong. */
export const ADMIN_EMAIL = 'admin@pigskinpicksix.com'

/** Copy constants for the payment notices, so every surface says the same thing. */
export const ENTRY_FEE_LABEL = '$40'
export const PICK_DEADLINE_LABEL = 'Saturday 11:00 AM CT'
