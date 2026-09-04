// GENERATED FILE — DO NOT EDIT.
// Source: src/templates/picksUnsubmitted.ts
// Regenerate: node scripts/sync-shared-templates.mjs

import type { BaseTemplateData } from './types.ts'
import { emailShell, emailButton, emailPanel, p, bullets } from './emailShell.ts'

export interface UnsubmittedPickItem {
  team: string
  spread: number
  isLock: boolean
  matchup: string
}

export interface PicksUnsubmittedData extends BaseTemplateData {
  deadlineStr: string
  /** complete = 6 picks + Lock; no_lock = 6 picks, no Lock; partial = fewer than 6 */
  tier: 'complete' | 'no_lock' | 'partial'
  pickCount: number
  picks: UnsubmittedPickItem[]
  unsubscribeUrl?: string
}

/**
 * "Your picks are saved but NOT submitted."
 *
 * Separate from pick_reminder on purpose: that template is written for an
 * empty sheet ("select 6 games, choose a Lock, submit"), so someone looking
 * at six saved picks and a Lock reads it, concludes it does not apply, and
 * deletes it. Payment is deliberately never mentioned -- picks count during
 * the grace period, and mixing the two muddies both messages.
 */
export function getPicksUnsubmittedSubject(d: PicksUnsubmittedData): string {
  if (d.tier === 'complete') return `⚠️ Your Week ${d.week} picks are saved — but NOT submitted`
  if (d.tier === 'no_lock') return `One thing missing: your Week ${d.week} Lock`
  const short = 6 - d.pickCount
  return `You're ${short} pick${short === 1 ? '' : 's'} away — Week ${d.week} closes soon`
}

const fmt = (i: UnsubmittedPickItem) => {
  const s = i.spread > 0 ? `+${i.spread}` : `${i.spread}`
  return `${i.team} ${s}${i.isLock ? ' 🔒 <strong>Lock</strong>' : ''}`
}

export function getPicksUnsubmittedHtml(d: PicksUnsubmittedData): string {
  const cta = emailButton(
    d.tier === 'complete' ? `Submit My Week ${d.week} Picks →` : 'Finish My Picks →',
    `${d.baseUrl}/picks`
  )

  const staleNote = p(
    `<span style="font-size:13px;color:#6b6252">If the pick sheet has been open in a tab for a while, ` +
    `<strong>refresh it first</strong> (⌘⇧R or Ctrl+F5) — a stale page can fail to submit. ` +
    `You'll get a confirmation email the moment your picks are in; if it doesn't arrive, they didn't go through.</span>`
  )

  if (d.tier === 'complete') {
    return emailShell({
      subtitle: 'Picks Not Submitted',
      heading: `Hi ${d.userDisplayName},`,
      preheader: `Your Week ${d.week} picks are saved but not entered — one click to fix`,
      unsubscribeUrl: d.unsubscribeUrl,
      bodyHtml:
        p(`You've got all six Week ${d.week} picks made and your Lock set — but they were never submitted, so <strong>they won't count.</strong>`) +
        emailPanel(`<strong>Your picks are not entered yet.</strong><br>Deadline: <strong>${d.deadlineStr}</strong>`, 'red') +
        p('Your saved picks:') +
        bullets(d.picks.map(fmt)) +
        p(`Open your pick sheet and hit <strong>Submit Picks</strong>. That's it — one click.`) +
        cta + staleNote,
    })
  }

  if (d.tier === 'no_lock') {
    return emailShell({
      subtitle: 'Lock Not Set',
      heading: `Hi ${d.userDisplayName},`,
      preheader: `All six Week ${d.week} picks are saved — you just need a Lock`,
      unsubscribeUrl: d.unsubscribeUrl,
      bodyHtml:
        p(`All six of your Week ${d.week} picks are saved — you just haven't set your <strong>Lock</strong>, so the sheet can't be submitted and nothing is entered yet.`) +
        emailPanel(`Pick the one game you're most confident in as your Lock — it doubles the margin bonus. Then hit <strong>Submit Picks</strong>.<br><br>Deadline: <strong>${d.deadlineStr}</strong>`, 'gold') +
        p('Your saved picks:') +
        bullets(d.picks.map(fmt)) +
        cta + staleNote,
    })
  }

  const short = 6 - d.pickCount
  return emailShell({
    subtitle: 'Picks Incomplete',
    heading: `Hi ${d.userDisplayName},`,
    preheader: `${d.pickCount} of 6 Week ${d.week} picks saved — not entered yet`,
    unsubscribeUrl: d.unsubscribeUrl,
    bodyHtml:
      p(`You've started your Week ${d.week} sheet — <strong>${d.pickCount} of 6 picks</strong> saved — but it isn't complete, so nothing is entered yet.`) +
      emailPanel(
        `<strong>To be entered you need:</strong>` +
        bullets([
          `${short} more pick${short === 1 ? '' : 's'} (6 total)`,
          '1 Lock selected',
          'Then hit <strong>Submit Picks</strong>',
        ]),
        'gold'
      ) +
      p(`Deadline is <strong>${d.deadlineStr}</strong>.`) +
      cta,
  })
}

export function getPicksUnsubmittedText(d: PicksUnsubmittedData): string {
  const lines = d.picks.map(i => `  - ${i.team} ${i.spread > 0 ? '+' : ''}${i.spread}${i.isLock ? ' (LOCK)' : ''}`)
  if (d.tier === 'complete') {
    return `PIGSKIN PICK SIX - PICKS NOT SUBMITTED

Hi ${d.userDisplayName},

You've got all six Week ${d.week} picks made and your Lock set - but they were
never submitted, so THEY WON'T COUNT.

YOUR PICKS ARE NOT ENTERED YET.
Deadline: ${d.deadlineStr}

Your saved picks:
${lines.join('\n')}

Open your pick sheet and hit "Submit Picks" - one click:
${d.baseUrl}/picks

If the page has been open a while, refresh it first. You'll get a confirmation
email once your picks are in; if it doesn't arrive, they didn't go through.
`
  }
  if (d.tier === 'no_lock') {
    return `PIGSKIN PICK SIX - LOCK NOT SET

Hi ${d.userDisplayName},

All six Week ${d.week} picks are saved, but you haven't set your Lock - so the
sheet can't be submitted and nothing is entered yet.

Deadline: ${d.deadlineStr}

Your saved picks:
${lines.join('\n')}

Set your Lock and submit: ${d.baseUrl}/picks
`
  }
  const short = 6 - d.pickCount
  return `PIGSKIN PICK SIX - PICKS INCOMPLETE

Hi ${d.userDisplayName},

You've started your Week ${d.week} sheet (${d.pickCount} of 6 picks saved), but it
isn't complete, so nothing is entered yet.

You need: ${short} more pick(s), 1 Lock, then hit Submit Picks.
Deadline: ${d.deadlineStr}

Finish your picks: ${d.baseUrl}/picks
`
}
