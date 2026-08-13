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
import {
  buildRecapEmailHtml,
  getRecapSubject,
  DEFAULT_SITE_URL,
  type RecapBlock,
  type RecapPicksCta,
} from './templates/recapEmail.ts'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/**
 * Rows the renderer needs but the payload deliberately does not carry.
 *
 * The recap's prose is admin-authored and lives in blog_posts; duplicating it
 * into 609 payloads would both bloat the queue and freeze it at queue time.
 * index.ts fetches the row and passes it here.
 */
export interface RenderContext {
  post?: {
    week: number
    slug: string
    excerpt?: string | null
    email_rundown?: string | null
  }
}

/** Which table row, if any, a template type needs fetched before rendering. */
export function payloadNeedsPost(templateType: string): boolean {
  return templateType === 'weekly_recap'
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

/** Payload written by queue_recap_emails / queue_recap_test. */
interface WeeklyRecapPayload {
  postId: string
  week: number
  displayName: string
  block: RecapBlock
  cta: { week: number; deadline: string | null; totalGames: number | null } | null
  isTest?: boolean
}

/** The CTA carries a raw timestamp so date formatting stays in one language. */
function formatDeadline(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    timeZone: 'America/Chicago',
  })
}

export function renderJobPayload(
  templateType: string,
  payload: unknown,
  context: RenderContext = {}
): RenderedEmail {
  if (!payload || typeof payload !== 'object') {
    throw new Error(`Job payload for '${templateType}' is missing or not an object`)
  }

  switch (templateType) {
    case 'weekly_recap': {
      const raw = payload as WeeklyRecapPayload
      const post = context.post
      if (!post) throw new Error('weekly_recap needs its blog_posts row')

      const cta: RecapPicksCta | null = raw.cta
        ? {
            week: raw.cta.week,
            deadlineStr: formatDeadline(raw.cta.deadline),
            totalGames: raw.cta.totalGames ?? null,
          }
        : null

      const recipient = {
        user_id: '',
        email: '',
        display_name: String(raw.displayName || 'there'),
        block: raw.block,
      }
      const { html, text } = buildRecapEmailHtml(
        recipient,
        { week: post.week, slug: post.slug, excerpt: post.excerpt },
        DEFAULT_SITE_URL,
        post.email_rundown || '',
        cta
      )
      // The subject is derived here rather than read off the job row, so the
      // queued row and the delivered mail cannot drift apart.
      let subject = getRecapSubject(post.week, cta)
      if (raw.isTest) {
        const variant = raw.block?.played === false ? '[TEST · no-picks variant]' : '[TEST]'
        subject = `${variant} ${subject}`
      }
      return { subject, html, text }
    }

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
