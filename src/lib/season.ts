import { supabase } from './supabase'

/**
 * Central source of truth for the "active season".
 *
 * Replaces the scattered `new Date().getFullYear()` / hardcoded `2025` defaults
 * that caused the app to query empty seasons after the calendar rolled over.
 * The value lives in the singleton `app_settings` row (see migration 153) so a
 * season rollover is a single admin-controlled update, not a code change.
 *
 * - FALLBACK_ACTIVE_SEASON is the last completed season; used until the DB value
 *   loads or if the fetch fails, so the UI never defaults to an empty future year.
 */
export const FALLBACK_ACTIVE_SEASON = 2025

export interface AppSettings {
  activeSeason: number
  graceWeeks: number
  /**
   * When the most recently imported LeagueSafe register was EXPORTED from
   * LeagueSafe (not when it was uploaded here). Player-facing watermark:
   * "no payment recorded as of <this>". Null until the first stamped import.
   */
  paymentsSyncedAt: string | null
}

let cached: AppSettings | null = null
let inflight: Promise<AppSettings> | null = null

/** Fetch (and cache) the active season + grace period from app_settings. */
export async function fetchAppSettings(): Promise<AppSettings> {
  if (cached) return cached
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('active_season, grace_period_weeks, payments_synced_at')
        .limit(1)
        .single()

      if (error || !data) throw error || new Error('app_settings empty')

      cached = {
        activeSeason: data.active_season,
        graceWeeks: data.grace_period_weeks ?? 0,
        paymentsSyncedAt: data.payments_synced_at ?? null,
      }
      return cached
    } catch (e) {
      console.warn(`[season] Could not load app_settings, falling back to ${FALLBACK_ACTIVE_SEASON}:`, e)
      // Do NOT cache the fallback, so a later call can retry the DB.
      return { activeSeason: FALLBACK_ACTIVE_SEASON, graceWeeks: 0, paymentsSyncedAt: null }
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/** Async accessor for the active season (use in services / non-React code). */
export async function getActiveSeason(): Promise<number> {
  return (await fetchAppSettings()).activeSeason
}

/**
 * Synchronous best-effort accessor: returns the cached active season if it has
 * been loaded, otherwise the fallback. For call sites that cannot await.
 */
export function getActiveSeasonSync(): number {
  return cached?.activeSeason ?? FALLBACK_ACTIVE_SEASON
}

/** Clear the cache (call after an admin changes the active season). */
export function clearAppSettingsCache(): void {
  cached = null
  inflight = null
}

/**
 * The payment watermark, formatted for players: "Sep 4, 7:45 AM CT".
 * Null when no import has stamped a download time yet -- callers hide the
 * "as of" clause entirely in that case rather than invent a date.
 */
export async function getPaymentsSyncedAtLabel(): Promise<string | null> {
  const { paymentsSyncedAt } = await fetchAppSettings()
  return formatSyncedAt(paymentsSyncedAt)
}

export function formatSyncedAt(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const label = d.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
  return `${label} CT`
}
