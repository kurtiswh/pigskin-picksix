import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  getWeekOpenedSubject, getWeekOpenedHtml,
  getPickReminderSubject, getPickReminderHtml,
  getDeadlineAlertSubject, getDeadlineAlertHtml,
  getPicksSubmittedSubject, getPicksSubmittedHtml,
  getPasswordResetSubject, getPasswordResetHtml,
} from '@/templates'
import { emailShell } from '@/templates/emailShell'
import { buildRecapEmailHtml, type RecapRecipient, type RecapPicksCta } from '@/services/recapService'
import type { BlogPost } from '@/types/blog'

/**
 * Live gallery of every email the platform sends, rendered from the real
 * template code with sample data — so the designs can be reviewed without
 * sending anything. Anything that changes in src/templates/ or the recap
 * builder shows up here automatically.
 */

interface Design {
  key: string
  title: string
  when: string
  subject: string
  html: string
}

const SITE = 'https://pigskinpicksix.com'

function buildDesigns(season: number): Design[] {
  const base = { userDisplayName: 'Kurtis', week: 1, season, baseUrl: SITE }
  const deadline = new Date(`${season}-09-05T16:00:00Z`)
  const deadlineStr = deadline.toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })

  const picks = [
    { game: 'Georgia @ Alabama', pick: 'Alabama -3', spread: -3, isLock: true, lockTime: deadline.toISOString() },
    { game: 'Michigan @ Ohio State', pick: 'Ohio State -7', spread: -7, isLock: false, lockTime: deadline.toISOString() },
    { game: 'Texas @ Oklahoma', pick: 'Texas -2.5', spread: -2.5, isLock: false, lockTime: deadline.toISOString() },
    { game: 'USC @ Oregon', pick: 'Oregon -6', spread: -6, isLock: false, lockTime: deadline.toISOString() },
    { game: 'Notre Dame @ Navy', pick: 'Notre Dame -10', spread: -10, isLock: false, lockTime: deadline.toISOString() },
    { game: 'Clemson @ Florida State', pick: 'Clemson +1', spread: 1, isLock: false, lockTime: deadline.toISOString() },
  ]

  // ── recap samples ──
  const recapPost = { week: 1, season, slug: `week-1-recap-${season}`, title: 'Week 1 Recap' } as BlogPost
  const rundown = `<ul>
    <li><strong>Top of the board:</strong> Garrett C took the week with 112 pts.</li>
    <li><strong>The field:</strong> 584 entrants went 52% ATS (1822-1682), and just 48% on locks.</li>
    <li><strong>Extremes:</strong> 3 perfect 6-0 — and 2 winless 0-6.</li>
    <li><strong>Fade of the week:</strong> Kansas — only 16% took them, and they covered.</li>
    <li><strong>Standings:</strong> Garrett C leads the season with 112 pts.</li>
  </ul>`
  const SAMPLE_TOKEN = '00000000-0000-4000-8000-000000000000'
  const played: RecapRecipient = {
    user_id: 'sample', email: 'you@example.com', display_name: 'Kurtis', unsubscribe_token: SAMPLE_TOKEN,
    block: {
      played: true, wins: 4, losses: 1, pushes: 1, points: 87, season_rank: 12, season_rank_prev: 25,
      picks: [
        { team: 'Alabama -3', is_lock: true, result: 'win', points: 26, game: 'Georgia @ Alabama' },
        { team: 'Ohio State -7', is_lock: false, result: 'loss', points: 0, game: 'Michigan @ Ohio State' },
        { team: 'Texas -2.5', is_lock: false, result: 'win', points: 21, game: 'Texas @ Oklahoma' },
        { team: 'Oregon -6', is_lock: false, result: 'win', points: 21, game: 'USC @ Oregon' },
        { team: 'Notre Dame -10', is_lock: false, result: 'push', points: 10, game: 'Notre Dame @ Navy' },
        { team: 'Clemson +1', is_lock: false, result: 'win', points: 20, game: 'Clemson @ Florida State' },
      ],
    },
  }
  const missed: RecapRecipient = {
    user_id: 'sample2', email: 'you@example.com', display_name: 'Kurtis', unsubscribe_token: SAMPLE_TOKEN,
    block: { played: false, wins: 0, losses: 0, pushes: 0, points: 0, season_rank: null, season_rank_prev: null, picks: [] },
  }
  const cta: RecapPicksCta = { week: 2, deadlineStr, totalGames: 15 }

  const recapPlayed = buildRecapEmailHtml(played, recapPost, SITE, rundown)
  const recapCombined = buildRecapEmailHtml(played, recapPost, SITE, rundown, cta)
  const recapMissed = buildRecapEmailHtml(missed, recapPost, SITE, rundown, cta)

  // Preseason drip: the body is authored per touch; server-side wrap_email_shell()
  // puts it in the same brand shell, mirrored here with the starter copy.
  const preseasonBody = `<p>Hey Kurtis,</p>
<p>Pigskin Pick Six is back for the ${season} season — here's how to get in:</p>
<ul>
  <li><strong>Pay your entry on LeagueSafe:</strong> <a href="#">join &amp; pay here</a></li>
  <li><strong>Register / log in:</strong> <a href="${SITE}">pigskinpicksix.com</a></li>
  <li><strong>Share your LeagueSafe payment ID / email</strong> so we can match your payment — just reply to this email.</li>
</ul>
<p>See you on the gridiron. 🏈</p>`

  return [
    {
      key: 'preseason',
      title: 'Preseason signup touch',
      when: 'Offseason drip — sends at each scheduled touch to every email in the system. Body is written per touch in the Preseason Signup Sequence card.',
      subject: 'Pigskin Pick Six is back — sign up!',
      html: emailShell({
        subtitle: 'Preseason', bodyHtml: preseasonBody,
        preheader: `The ${season} season is coming`,
        unsubscribeUrl: `${SITE}/unsubscribe?t=sample-token`,
      }),
    },
    {
      key: 'week_opened',
      title: 'Week opening announcement',
      when: "Sent to all active players when you open a week's picks — only if the Week Opening Email toggle is on (off by default; the recap can carry this invitation instead).",
      subject: getWeekOpenedSubject({ ...base, deadline, deadlineStr, totalGames: 15 }),
      html: getWeekOpenedHtml({ ...base, deadline, deadlineStr, totalGames: 15 }),
    },
    {
      key: 'pick_reminder',
      title: 'Pick reminder',
      when: 'Sent by cron at each enabled "hours before deadline" step, to players who have not submitted.',
      subject: getPickReminderSubject({ ...base, deadline, deadlineStr }),
      html: getPickReminderHtml({ ...base, deadline, deadlineStr }),
    },
    {
      key: 'deadline_alert',
      title: 'Final reminder / deadline alert',
      when: 'The urgent variant used for the last reminder window before picks lock.',
      subject: getDeadlineAlertSubject({ ...base, deadline, deadlineStr, hoursLeft: 2 }),
      html: getDeadlineAlertHtml({ ...base, deadline, deadlineStr, hoursLeft: 2 }),
    },
    {
      key: 'picks_submitted',
      title: 'Pick confirmation',
      when: 'Sent instantly when a player submits their six picks. Always on.',
      subject: getPicksSubmittedSubject({ ...base, picks, submittedAt: deadline, submittedStr: deadlineStr }),
      html: getPicksSubmittedHtml({ ...base, picks, submittedAt: deadline, submittedStr: deadlineStr }),
    },
    {
      key: 'recap_played',
      title: 'Weekly recap — player who played',
      when: 'Sent from the Blog Editor after scoring. Personalized: their scorecard, their six picks, then your edited rundown.',
      subject: `Week 1 Recap — your results & the rundown 🏈`,
      html: recapPlayed.html,
    },
    {
      key: 'recap_combined',
      title: 'Weekly recap + next week\'s picks (combined)',
      when: 'Same email with the "Week N+1 is open" invitation attached — chosen with a checkbox at send time. Replaces sending a separate week-opening blast.',
      subject: `Week 1 Recap — your results, and Week 2 is open 🏈`,
      html: recapCombined.html,
    },
    {
      key: 'recap_missed',
      title: 'Weekly recap — player who missed the week',
      when: 'Paid entrants who submitted no picks get this nudge instead of an all-zeros scorecard. They still get the rundown and the invitation back in.',
      subject: `Week 1 Recap — your results, and Week 2 is open 🏈`,
      html: recapMissed.html,
    },
    {
      key: 'password_reset',
      title: 'Password reset',
      when: 'On request, from the login screen.',
      subject: getPasswordResetSubject({ userDisplayName: 'Kurtis', resetUrl: `${SITE}/reset-password?token=sample` }),
      html: getPasswordResetHtml({ userDisplayName: 'Kurtis', resetUrl: `${SITE}/reset-password?token=sample` }),
    },
  ]
}

function DesignFrame({ html, title }: { html: string; title: string }) {
  const [height, setHeight] = useState(520)
  return (
    <iframe
      title={`${title} preview`}
      srcDoc={html}
      className="w-full border-0 block"
      style={{ height }}
      onLoad={(e) => {
        const doc = (e.target as HTMLIFrameElement).contentDocument
        const h = doc?.documentElement?.scrollHeight
        if (h) setHeight(h + 16)
      }}
    />
  )
}

export default function EmailDesigns({ season }: { season: number }) {
  const designs = useMemo(() => buildDesigns(season), [season])
  const [open, setOpen] = useState<string | null>(designs[0]?.key ?? null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>🎨 Email Designs</CardTitle>
        <p className="text-sm text-charcoal-600">
          Every email rendered from the live templates with sample data — nothing is sent. Edits to the
          templates show up here automatically.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {designs.map(d => {
          const isOpen = open === d.key
          return (
            <div key={d.key} className="border border-[#ece7de] rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : d.key)}
                className="w-full text-left px-4 py-3 hover:bg-[#faf8f4] transition-colors"
                aria-expanded={isOpen}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-pigskin-900">{d.title}</div>
                    <div className="text-xs text-charcoal-500 mt-0.5">{d.when}</div>
                    <div className="text-xs text-charcoal-700 mt-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-charcoal-400 mr-2">Subject</span>
                      {d.subject}
                    </div>
                  </div>
                  <span className="text-charcoal-400 shrink-0 mt-1">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>
              {isOpen && (
                <div className="bg-[#F0EEE8] border-t border-[#ece7de] p-2">
                  <DesignFrame html={d.html} title={d.title} />
                </div>
              )}
            </div>
          )
        })}
        <p className="text-xs text-charcoal-500 pt-2">
          All emails send from <b>Pigskin Pick Six &lt;admin@pigskinpicksix.com&gt;</b>. Replies go to that inbox.
          The bulk sends (preseason signup, weekly recap) carry a one-click <b>unsubscribe</b> link that needs no login;
          opting out stops every contest email, and registering turns them back on.
        </p>
      </CardContent>
    </Card>
  )
}
