/**
 * Render an email_jobs row that carries a `payload` instead of HTML.
 *
 * Jobs queued by the queue_*_pick_confirmation RPCs store only structured,
 * server-derived data — never markup. This is where that data becomes an email,
 * using the same templates the app renders from (kept in sync by
 * scripts/sync-shared-templates.mjs).
 *
 * Anything a client could have written into html_content is deliberately not
 * reachable from here: unprivileged callers of send-email can only send jobs
 * that have a payload, so the body is always produced by this file.
 */

import {
  getPicksSubmittedSubject,
  getPicksSubmittedHtml,
  getPicksSubmittedText,
} from './templates/picksSubmitted.ts'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/** Payload written by queue_pick_confirmation / queue_anonymous_pick_confirmation. */
interface PicksSubmittedPayload {
  userDisplayName: string
  week: number
  season: number
  submittedAt: string
  picks: Array<{
    game: string
    pick: string
    spread: number
    isLock: boolean
    lockTime: string
  }>
}

const SITE_URL = 'https://pigskinpicksix.com'

/**
 * Same option set EmailTemplates.picksSubmitted uses, so the server-rendered
 * confirmation reads identically to the one the app used to build. The browser
 * used the reader's own zone; here there isn't one, so the league's is fixed.
 */
function formatSubmitted(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: 'America/Chicago',
  })
}

export function renderJobPayload(templateType: string, payload: unknown): RenderedEmail {
  if (!payload || typeof payload !== 'object') {
    throw new Error(`Job payload for '${templateType}' is missing or not an object`)
  }

  switch (templateType) {
    case 'picks_submitted': {
      const raw = payload as PicksSubmittedPayload
      if (!Array.isArray(raw.picks) || raw.picks.length === 0) {
        throw new Error('picks_submitted payload has no picks')
      }
      const data = {
        userDisplayName: String(raw.userDisplayName || 'there'),
        week: Number(raw.week),
        season: Number(raw.season),
        baseUrl: SITE_URL,
        picks: raw.picks.map((p) => ({
          game: String(p.game ?? ''),
          pick: String(p.pick ?? ''),
          spread: Number(p.spread ?? 0),
          isLock: Boolean(p.isLock),
          lockTime: String(p.lockTime ?? ''),
        })),
        submittedAt: new Date(raw.submittedAt),
        submittedStr: formatSubmitted(raw.submittedAt),
      }
      return {
        subject: getPicksSubmittedSubject(data),
        html: getPicksSubmittedHtml(data),
        text: getPicksSubmittedText(data),
      }
    }

    default:
      throw new Error(`No server-side renderer for template_type '${templateType}'`)
  }
}
