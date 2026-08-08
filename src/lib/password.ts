/**
 * One password rule, stated the same way everywhere.
 *
 * Registration used to advise 8 characters and enforce nothing; the reset page
 * enforced 6 and listed three "requirements", two of which were advice. Both
 * now use these.
 *
 * This governs new and changed passwords only — existing shorter ones keep
 * working, because Supabase checks its own minimum at sign-in, not ours.
 */
export const MIN_PASSWORD_LENGTH = 8

export const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters.`

export const PASSWORD_TOO_SHORT = `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`
