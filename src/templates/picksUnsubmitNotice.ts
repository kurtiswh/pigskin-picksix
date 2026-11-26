import type { BaseTemplateData } from './types'
import { emailShell, emailButton, emailPanel, p, bullets, esc } from './emailShell'

export interface UnsubmitNoticePickItem {
  team: string
  spread: number
  isLock: boolean
  matchup: string
}

export interface PicksUnsubmitNoticeData extends BaseTemplateData {
  deadlineStr: string
  /** When the sheet stopped being submitted, formatted in league time. */
  unsubmittedStr: string
  pickCount: number
  hasLock: boolean
  picks: UnsubmitNoticePickItem[]
}

/**
 * "Your picks were just unsubmitted."
 *
 * Sent the moment a submitted sheet stops being submitted, which is what
 * editing a submitted pick does. The pick sheet says so twice on screen, but a
 * dialog leaves nothing behind: a player who edits on Saturday morning and
 * walks away has a "Picks Confirmed" email from Friday as the last word in
 * their inbox. This is the record that the confirmation no longer holds.
 *
 * Separate from picks_unsubmitted on purpose. That one says the picks "were
 * never submitted", which is wrong here and reads as an accusation to someone
 * who did submit.
 */
export function getPicksUnsubmitNoticeSubject(d: PicksUnsubmitNoticeData): string {
  return `⚠️ Your Week ${d.week} picks are no longer submitted`
}

const fmt = (i: UnsubmitNoticePickItem) => {
  const s = i.spread > 0 ? `+${i.spread}` : `${i.spread}`
  return `${esc(i.team)} ${s}${i.isLock ? ' 🔒 <strong>Lock</strong>' : ''}`
}

/** What still has to happen before the sheet can be submitted again. */
function missing(d: PicksUnsubmitNoticeData): string[] {
  const out: string[] = []
  const short = 6 - d.pickCount
  if (short > 0) out.push(`${short} more pick${short === 1 ? '' : 's'} (6 total)`)
  if (!d.hasLock) out.push('1 Lock selected')
  return out
}

export function getPicksUnsubmitNoticeHtml(d: PicksUnsubmitNoticeData): string {
  const need = missing(d)
  const ready = need.length === 0

  return emailShell({
    subtitle: 'Picks Unsubmitted',
    heading: `Hi ${esc(d.userDisplayName)},`,
    preheader: `Your Week ${d.week} picks are not entered right now. Submit again before the deadline.`,
    bodyHtml:
      p(`Your Week ${d.week} picks were unsubmitted on <strong>${d.unsubmittedStr}</strong>. That happens whenever a submitted pick sheet is changed.`) +
      emailPanel(
        `<strong>Your picks are not entered right now.</strong><br>` +
        `They will not count unless you submit again before <strong>${d.deadlineStr}</strong>.`,
        'red'
      ) +
      (d.picks.length > 0
        ? p(`Your saved picks (${d.pickCount} of 6):`) + bullets(d.picks.map(fmt))
        : p('You have no picks saved for this week.')) +
      (ready
        ? p(`Open your pick sheet and hit <strong>Submit Picks</strong>. You'll get a confirmation email once they are in.`)
        : p('Before you can submit you still need:') + bullets([...need, 'Then hit <strong>Submit Picks</strong>'])) +
      emailButton(ready ? `Submit My Week ${d.week} Picks →` : 'Finish My Picks →', `${d.baseUrl}/picks`) +
      p(
        `<span style="font-size:13px;color:#6b6252">Already submitted again? Then you have a newer ` +
        `"Picks Confirmed" email and you're set. Whichever of the two emails is most recent is where things stand. ` +
        `If you did not change your picks, reply to this email.</span>`
      ),
  })
}

export function getPicksUnsubmitNoticeText(d: PicksUnsubmitNoticeData): string {
  const lines = d.picks.map(i => `  - ${i.team} ${i.spread > 0 ? '+' : ''}${i.spread}${i.isLock ? ' (LOCK)' : ''}`)
  const need = missing(d)
  return `PIGSKIN PICK SIX - PICKS UNSUBMITTED

Hi ${d.userDisplayName},

Your Week ${d.week} picks were unsubmitted on ${d.unsubmittedStr}. That happens
whenever a submitted pick sheet is changed.

YOUR PICKS ARE NOT ENTERED RIGHT NOW.
They will not count unless you submit again before ${d.deadlineStr}.

${d.picks.length > 0 ? `Your saved picks (${d.pickCount} of 6):\n${lines.join('\n')}` : 'You have no picks saved for this week.'}

${need.length === 0
    ? 'Open your pick sheet and hit "Submit Picks".'
    : `Before you can submit you still need: ${need.join(', ')}. Then hit "Submit Picks".`}
${d.baseUrl}/picks

Already submitted again? Then you have a newer "Picks Confirmed" email and
you're set. Whichever of the two emails is most recent is where things stand.
If you did not change your picks, reply to this email.
`
}
