/**
 * Weekly recap email — one personalized message per paid entrant.
 *
 * Pure: no Supabase client, no `window`. That is what lets the send-email Edge
 * Function render it from a queued job (scripts/sync-shared-templates.mjs keeps
 * the shared copy in step) instead of the admin's browser posting HTML.
 *
 * The prose an admin writes is NOT passed in from a client. `rundownHtml` and
 * `excerpt` are read back out of blog_posts by whoever calls this.
 */

import { emailShell, emailButton, esc } from './emailShell'

export interface RecapPickCell {
  team: string
  is_lock: boolean
  result: string | null
  points: number | null
  game: string
}

export interface RecapBlock {
  /** False when this paid entrant submitted no picks for the week (migration 183). */
  played?: boolean
  wins: number
  losses: number
  pushes: number
  points: number
  season_rank: number | null
  season_rank_prev: number | null
  picks: RecapPickCell[]
}

/** Optional "picks are open" invitation appended to the recap (chosen at send time). */
export interface RecapPicksCta {
  week: number
  deadlineStr: string | null
  totalGames: number | null
}

export interface RecapRecipient {
  user_id: string
  email: string
  display_name: string
  block: RecapBlock
  /** Per-user opt-out token (migration 184) — renders the footer unsubscribe link. */
  unsubscribe_token?: string
}

/** The bits of a blog_posts row the email needs. Read from the database, never from a client. */
export interface RecapPostRef {
  week: number
  slug: string
  excerpt?: string | null
}

export const DEFAULT_SITE_URL = 'https://pigskinpicksix.com'

/** Subject line — shared so the queued row and the sent mail cannot disagree. */
export function getRecapSubject(week: number, cta?: RecapPicksCta | null): string {
  return cta
    ? `Week ${week} Recap — your results, and Week ${cta.week} is open 🏈`
    : `Week ${week} Recap — your results & the rundown 🏈`
}

export function buildRecapEmailHtml(
  r: RecapRecipient,
  post: RecapPostRef,
  siteUrl: string = DEFAULT_SITE_URL,
  rundownHtml?: string,
  cta?: RecapPicksCta | null
): { html: string; text: string } {
  const b = r.block
  const delta = b.season_rank_prev != null && b.season_rank != null ? b.season_rank_prev - b.season_rank : null
  const move = delta == null || delta === 0 ? '' : delta > 0 ? ` ▲${delta}` : ` ▼${Math.abs(delta)}`
  const rankLine = b.season_rank != null ? `#${b.season_rank} overall${move}` : ''
  const chips = (b.picks || []).map(p => {
    const color = p.result === 'win' ? '#2E7D4F' : p.result === 'loss' ? '#B23A3A' : '#B8860B'
    const bg = p.result === 'win' ? '#E6F4EC' : p.result === 'loss' ? '#FBEAEA' : '#FBF3DC'
    const lock = p.is_lock ? '🔒 ' : ''
    const pts = p.points != null ? ` (${p.points})` : ''
    return `<span style="display:inline-block;margin:2px;padding:3px 9px;border-radius:6px;background:${bg};color:${color};font-size:13px;border:1px solid ${color}33">${lock}${esc(p.team)}${pts}</span>`
  }).join(' ')
  const postUrl = `${siteUrl}/blog/${encodeURIComponent(post.slug)}`
  // rundownHtml is admin-authored rich text out of blog_posts.email_rundown, so
  // it is intentionally used as markup. The excerpt fallback is plain text.
  const rundown = rundownHtml && rundownHtml.trim()
    ? rundownHtml
    : (post.excerpt?.trim() ? `<p style="font-size:15px;color:#2A2118">${esc(post.excerpt)}</p>` : '')

  // Paid entrants who submitted nothing this week get the nudge variant instead
  // of an all-zeros scorecard (migration 183 added them to the recipient list).
  const played = b.played !== false && (b.picks || []).length > 0
  const name = esc(r.display_name)

  // Personalized "Your Week N" card (gold-tinted, distinct from the brown header).
  const statCard = played
    ? `<div style="background:#FBF3DC;border:1px solid #EAD9AE;border-radius:10px;padding:16px 18px;text-align:center">
    <div style="color:#8a6d1f;font-size:12px;letter-spacing:.1em;text-transform:uppercase;font-weight:800">Your Week ${post.week}</div>
    <div style="font-size:28px;font-weight:800;margin-top:4px;color:#4B3621">${b.wins}–${b.losses}${b.pushes ? `–${b.pushes}` : ''} · ${b.points} pts</div>
    ${rankLine ? `<div style="font-size:13px;color:#8a6d1f;margin-top:4px">${rankLine}</div>` : ''}
  </div>`
    : `<div style="background:#F2EFE9;border:1px dashed #C9BCA6;border-radius:10px;padding:16px 18px;text-align:center">
    <div style="color:#7A6E60;font-size:12px;letter-spacing:.1em;text-transform:uppercase;font-weight:800">Your Week ${post.week}</div>
    <div style="font-size:28px;font-weight:800;margin-top:4px;color:#7A6E60">No picks in</div>
    <div style="font-size:13px;color:#7A6E60;margin-top:4px">0 for 0 — technically undefeated${rankLine ? ` · still ${rankLine}` : ''}</div>
  </div>`

  const personalSection = played
    ? `<p style="font-size:15px;color:#2A2118;margin:16px 0 8px">Hey ${name} — here's how your six landed:</p>` +
      `<div style="margin:0 0 8px">${chips}</div>`
    : `<p style="font-size:15px;color:#2A2118;margin:16px 0 8px">Hey ${name} — the board went on without you this week. No picks, no points, no bad beats to complain about.${cta ? ` Week ${cta.week} is open, so let's not make it a habit.` : ' Here\'s what you missed.'}</p>`

  // Optional "next week is open" invitation — becomes the primary action.
  const ctaPanel = cta
    ? `<div style="background:#FBF3DC;border:1px solid #EAD9AE;border-radius:10px;padding:16px 18px;margin:20px 0 0;text-align:center">
    <div style="color:#8a6d1f;font-size:12px;letter-spacing:.1em;text-transform:uppercase;font-weight:800">Week ${cta.week} is open</div>
    ${cta.totalGames ? `<div style="font-size:18px;font-weight:800;margin-top:4px;color:#4B3621">${cta.totalGames} games on the board</div>` : ''}
    ${cta.deadlineStr ? `<div style="font-size:13px;color:#8a6d1f;margin-top:4px">⏰ Picks due ${esc(cta.deadlineStr)}</div>` : ''}
  </div>`
    : ''

  const actions = cta
    ? ctaPanel +
      emailButton(`Make your Week ${cta.week} picks →`, `${siteUrl}/picks`) +
      `<div style="text-align:center;margin:-10px 0 0"><a href="${postUrl}" style="color:#7A6E60;font-size:14px">Read the full Week ${post.week} recap</a></div>`
    : emailButton(`Read the full Week ${post.week} recap →`, postUrl)

  const bodyInner =
    statCard +
    personalSection +
    `<div style="border-top:1px solid #E5DFD5;margin-top:18px;padding-top:14px">` +
    `<div style="font-weight:800;color:#4B3621;margin-bottom:6px">The rundown</div>` +
    `${rundown || '<p style="font-size:15px;color:#7A6E60">Read the full recap for the week that was.</p>'}</div>` +
    actions

  const preheader = played
    ? `Your Week ${post.week}: ${b.wins}-${b.losses}, ${b.points} pts`
    : `You sat out Week ${post.week}${cta ? ` — Week ${cta.week} is open` : ''}`

  const html = emailShell({
    subtitle: `Week ${post.week} Recap`,
    bodyHtml: bodyInner,
    preheader,
    // No unsubscribe link: the recap goes only to entrants who paid into this
    // season, and ~84% of them have site accounts, so the footer's "email
    // preferences" link (→ /profile) is the right control. The public
    // token-based opt-out is for the preseason blast, which reaches cold
    // addresses that never registered. Opt-outs are still honored — anyone who
    // unsubscribed is filtered out of wr_recap_recipients().
  })
  const text = played
    ? `Your Week ${post.week}: ${b.wins}-${b.losses}, ${b.points} pts${rankLine ? `, ${rankLine}` : ''}. Read the full recap: ${postUrl}${cta ? `\nWeek ${cta.week} is open — make your picks: ${siteUrl}/picks` : ''}`
    : `No picks in for Week ${post.week}. Here's what you missed: ${postUrl}${cta ? `\nWeek ${cta.week} is open — get back in: ${siteUrl}/picks` : ''}`
  return { html, text }
}
