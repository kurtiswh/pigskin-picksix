import { supabase } from './supabase'

/**
 * Fire-and-forget failure telemetry for the pick sheet.
 *
 * When a submit or pick write throws, the player already sees the error --
 * this makes sure the COMMISSIONER does too (Week Review reads it back).
 * Must never throw and never block the UI; losing a log line is acceptable,
 * breaking submission handling twice over is not.
 */
export function logSubmissionFailure(
  stage: 'submit' | 'pick' | 'lock' | 'remove',
  week: number,
  season: number,
  err: unknown,
  userId?: string | null
): void {
  try {
    if (!userId) return
    const message = String((err as any)?.message ?? err ?? 'unknown error').slice(0, 500)
    void supabase
      .from('submission_failures')
      .insert({
        user_id: userId,
        week,
        season,
        stage,
        message,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
      })
      .then(({ error }) => {
        if (error) console.warn('Could not record submission failure:', error.message)
      })
  } catch {
    /* telemetry must never break the page */
  }
}
