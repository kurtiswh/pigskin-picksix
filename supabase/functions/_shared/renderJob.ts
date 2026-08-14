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
import {
  getPickReminderSubject, getPickReminderHtml, getPickReminderText,
} from './templates/pickReminder.ts'
import {
  getDeadlineAlertSubject, getDeadlineAlertHtml, getDeadlineAlertText,
} from './templates/deadlineAlert.ts'
import {
  getWeekOpenedSubject, getWeekOpenedHtml, getWeekOpenedText,
} from './templates/weekOpened.ts'
import {
  getWeeklyResultsSubject, getWeeklyResultsHtml, getWeeklyResultsText,
} from './templates/weeklyResults.ts'

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
  /** Preview built from invented picks because the season has no paid entrants yet. */
  isSample?: boolean
}

/** Payload written by queue_week_opened_announcement / queue_pick_reminders. */
interface WeekEmailPayload {
  userDisplayName?: string
  week: number
  season: number
  deadline: string
  hoursLeft?: number
  totalGames?: number
}

/** Payload written by queue_weekly_results. */
interface WeeklyResultsPayload {
  userDisplayName: string
  week: number
  season: number
  userStats: {
    weeklyPoints: number
    weeklyRank: number
    totalPlayers: number
    seasonPoints: number
    seasonRank: number
    picks: Array<{
      game: string
      pick: string
      result: 'win' | 'loss' | 'push'
      points: number
      isLock: boolean
    }>
  }
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
        // Say so when the scorecard is invented — a preseason preview has real
        // matchups but made-up results, and it should not read as a real week.
        subject = `${variant}${raw.isSample ? ' [SAMPLE DATA]' : ''} ${subject}`
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

    // The week batches an admin triggers when a week opens or closes. All four
    // carry a raw `deadline` timestamp rather than a formatted string, so the
    // date is rendered in one place instead of by whichever browser queued it.
    case 'pick_reminder': {
      const raw = payload as WeekEmailPayload
      const data = {
        userDisplayName: String(raw.userDisplayName || 'there'),
        week: Number(raw.week), season: Number(raw.season), baseUrl: SITE_URL,
        deadline: new Date(raw.deadline),
        deadlineStr: formatDeadline(raw.deadline) ?? '',
      }
      return {
        subject: getPickReminderSubject(data),
        html: getPickReminderHtml(data),
        text: getPickReminderText(data),
      }
    }

    case 'deadline_alert': {
      const raw = payload as WeekEmailPayload
      const data = {
        userDisplayName: String(raw.userDisplayName || 'there'),
        week: Number(raw.week), season: Number(raw.season), baseUrl: SITE_URL,
        deadline: new Date(raw.deadline),
        deadlineStr: formatDeadline(raw.deadline) ?? '',
        hoursLeft: Number(raw.hoursLeft ?? 0),
      }
      return {
        subject: getDeadlineAlertSubject(data),
        html: getDeadlineAlertHtml(data),
        text: getDeadlineAlertText(data),
      }
    }

    case 'week_opened': {
      const raw = payload as WeekEmailPayload
      const data = {
        week: Number(raw.week), season: Number(raw.season), baseUrl: SITE_URL,
        deadline: new Date(raw.deadline),
        deadlineStr: formatDeadline(raw.deadline) ?? '',
        totalGames: Number(raw.totalGames ?? 0),
      }
      return {
        subject: getWeekOpenedSubject(data),
        html: getWeekOpenedHtml(data),
        text: getWeekOpenedText(data),
      }
    }

    case 'weekly_results': {
      const raw = payload as WeeklyResultsPayload
      const data = {
        userDisplayName: String(raw.userDisplayName || 'there'),
        week: Number(raw.week), season: Number(raw.season), baseUrl: SITE_URL,
        userStats: raw.userStats,
      }
      return {
        subject: getWeeklyResultsSubject(data),
        html: getWeeklyResultsHtml(data),
        text: getWeeklyResultsText(data),
      }
    }

    default:
      throw new Error(`No server-side renderer for template_type '${templateType}'`)
  }
}
