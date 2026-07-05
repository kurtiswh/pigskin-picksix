import { supabase } from '@/lib/supabase'
import { EmailService } from './emailService'
import { emailShell, emailButton } from '@/templates/emailShell'
import type { BlogPost } from '@/types/blog'

/**
 * Weekly recap seeding (Part B feature).
 *
 * - loadRecapSeed(): the outlier data pack for the admin panel / draft.
 * - buildDraftHtml(): turns the seed into a pre-filled HTML draft (admin rewrites).
 * - createRecapDraft(): creates the unpublished blog post from the seed.
 * - sendRecapTest() / sendRecapToAll(): personalized email (each recipient's own
 *   results) + the post excerpt as the "rundown" + a link to the full post.
 */

export interface RecapSeed {
  week: number
  season: number
  winners: { name: string; points: number }[]
  group_wins: number; group_losses: number; group_win_pct: number | null
  lock_hits: number; lock_total: number; lock_win_pct: number | null
  entrants: number
  perfect_count: number; perfect: string[]
  winless_count: number; winless: string[]
  biggest_upset: { game: string; team: string; pick_pct: number } | null
  biggest_crowd_miss: { game: string; team: string; pick_pct: number } | null
  best_lock: { game: string; team: string; wins: number } | null
  worst_lock: { game: string; losses: number } | null
  biggest_cover: { game: string; team: string; bonus: number } | null
  season_leader: { name: string; points: number } | null
  games: { game: string; away_pct: number; home_pct: number; locks: number; winner: string | null; win_pts: number; lock_win_pts: number }[]
}

export interface RecapPickCell {
  team: string; is_lock: boolean; result: string | null; points: number | null; game: string
}
export interface RecapBlock {
  wins: number; losses: number; pushes: number; points: number
  season_rank: number | null; season_rank_prev: number | null
  picks: RecapPickCell[]
}
export interface RecapRecipient { user_id: string; email: string; display_name: string; block: RecapBlock }

export async function loadRecapSeed(week: number, season: number): Promise<RecapSeed> {
  const { data, error } = await supabase.rpc('wr_recap_seed', { p_week: week, p_season: season })
  if (error) throw error
  return data as RecapSeed
}

async function loadRecipients(week: number, season: number): Promise<RecapRecipient[]> {
  const { data, error } = await supabase.rpc('wr_recap_recipients', { p_week: week, p_season: season })
  if (error) throw error
  return (data as RecapRecipient[]) || []
}

const n = (v: number | null | undefined, d = '—') => (v == null ? d : String(v))

/** Pre-filled HTML draft (matches the HTML blog editor). Admin rewrites the prose. */
export function buildDraftHtml(s: RecapSeed): string {
  const winner = s.winners?.[0]
  const winnerLine = s.winners?.length > 1
    ? `${s.winners.length} tied for the top at <strong>${winner?.points}</strong> points (${s.winners.map(w => w.name).join(', ')})`
    : winner ? `<strong>${winner.name}</strong> took the week with <strong>${winner.points}</strong> points` : 'TBD'
  // Quill-safe list (the rich-text editor strips <table>).
  const gameItems = (s.games || []).map(g =>
    `<li><strong>${g.game}</strong> — winner ATS: ${g.winner ?? '—'} · picked ${g.away_pct}%/${g.home_pct}% (away/home) · ${g.locks} locks · <strong>${g.win_pts} pts</strong> (lock ${g.lock_win_pts})</li>`
  ).join('')
  return `<!-- seeded recap draft — rewrite the prose, keep/trim the numbers -->
<h2>Top of the Board</h2>
<p>[your intro] ${winnerLine}. ${s.perfect_count} perfect card${s.perfect_count === 1 ? '' : 's'} this week${s.winless_count ? `; ${s.winless_count} went 0-6` : ''}.</p>

<h2>The Numbers</h2>
<ul>
  <li>Group win %: <strong>${n(s.group_win_pct)}%</strong> (${s.group_wins}-${s.group_losses} ATS) · Lock win %: <strong>${n(s.lock_win_pct)}%</strong> (${s.lock_hits}/${s.lock_total})</li>
  ${s.biggest_upset ? `<li>Biggest upset that hit: <strong>${s.biggest_upset.team}</strong> — only ${s.biggest_upset.pick_pct}% picked them.</li>` : ''}
  ${s.biggest_crowd_miss ? `<li>Biggest crowd miss: <strong>${s.biggest_crowd_miss.team}</strong> — ${s.biggest_crowd_miss.pick_pct}% took them and lost.</li>` : ''}
  ${s.biggest_cover ? `<li>Biggest cover: <strong>${s.biggest_cover.team}</strong> (+${s.biggest_cover.bonus} margin bonus).</li>` : ''}
</ul>

<h2>Lock Report</h2>
<p>[your take] ${s.best_lock ? `Best lock: <strong>${s.best_lock.team}</strong> (${s.best_lock.wins} hit).` : ''} ${s.worst_lock ? `Roughest: ${s.worst_lock.losses} people got burned on ${s.worst_lock.game}.` : ''}</p>

<h2>Standings Drama</h2>
<p>[your take] ${s.season_leader ? `<strong>${s.season_leader.name}</strong> leads the season with ${s.season_leader.points} points.` : ''}</p>

<h2>Points by Game</h2>
<ul>${gameItems}</ul>`
}

export async function createRecapDraft(seed: RecapSeed, authorId: string): Promise<BlogPost> {
  // Insert via the supabase client so the admin's session JWT is attached
  // automatically (DirectBlogService's manual fetch falls back to the anon key
  // and trips the admin RLS policy on blog_posts).
  const base = `week-${seed.week}-recap-${seed.season}`
  let slug = base
  for (let i = 0; i < 6; i++) {
    const { data: existing } = await supabase.from('blog_posts').select('id').eq('slug', slug).limit(1)
    if (!existing || existing.length === 0) break
    slug = `${base}-${i + 2}`
  }
  const { data, error } = await supabase
    .from('blog_posts')
    .insert({
      title: `Week ${seed.week} Recap`,
      content: buildDraftHtml(seed),
      excerpt: buildExcerpt(seed),
      email_rundown: buildRundownHtml(seed),
      season: seed.season,
      week: seed.week,
      is_published: false,
      slug,
      author_id: authorId,
    })
    .select()
    .single()
  if (error) throw error
  return data as BlogPost
}

const nameList = (names: string[], max = 4) =>
  !names?.length ? '' : names.length <= max ? ` (${names.join(', ')})` : ` (${names.slice(0, max).join(', ')} +${names.length - max} more)`

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Auto-generated rich-text (HTML) rundown — edited WYSIWYG in the Blog Editor
 *  and used verbatim in the email, so the box matches the email exactly. */
export function buildRundownHtml(s: RecapSeed): string {
  const li = (t: string) => `<li>${t}</li>`
  const items: string[] = []
  const w = s.winners?.[0]
  if (w) items.push(li(s.winners.length > 1
    ? `<strong>Top of the board:</strong> ${s.winners.length} tied at ${w.points} pts${nameList(s.winners.map(x => x.name))}.`
    : `<strong>Top of the board:</strong> ${w.name} took the week with ${w.points} pts.`))
  if (s.group_win_pct != null)
    items.push(li(`<strong>The field:</strong> ${s.entrants} entrants went ${s.group_win_pct}% ATS (${s.group_wins}-${s.group_losses})${s.lock_win_pct != null ? `, and just ${s.lock_win_pct}% on locks (${s.lock_hits}/${s.lock_total})` : ''}.`))
  if (s.perfect_count || s.winless_count)
    items.push(li(`<strong>Extremes:</strong> ${s.perfect_count} perfect 6-0${nameList(s.perfect)}${s.winless_count ? ` — and ${s.winless_count} winless 0-6${nameList(s.winless)}` : ''}.`))
  if (s.biggest_upset)
    items.push(li(`<strong>Fade of the week:</strong> ${s.biggest_upset.team} — only ${s.biggest_upset.pick_pct}% of the field took them, and they covered.`))
  if (s.biggest_crowd_miss)
    items.push(li(`<strong>Crowd got burned:</strong> ${s.biggest_crowd_miss.pick_pct}% were on ${s.biggest_crowd_miss.team} and lost.`))
  if (s.best_lock || s.worst_lock)
    items.push(li(`<strong>Lock report:</strong> ${s.best_lock ? `best was ${s.best_lock.team} (${s.best_lock.wins} cashed)` : ''}${s.best_lock && s.worst_lock ? '; ' : ''}${s.worst_lock ? `${s.worst_lock.losses} got burned on ${s.worst_lock.game}` : ''}.`))
  if (s.biggest_cover)
    items.push(li(`<strong>Biggest cover:</strong> ${s.biggest_cover.team} rolled for a +${s.biggest_cover.bonus} margin bonus.`))
  if (s.season_leader)
    items.push(li(`<strong>Standings:</strong> ${s.season_leader.name} leads the season with ${s.season_leader.points} pts.`))
  return `<ul>${items.join('')}</ul>`
}

/** Short plain-text excerpt (blog teaser, <=300 chars) auto-generated from the seed. */
export function buildExcerpt(s: RecapSeed): string {
  const parts: string[] = []
  const w = s.winners?.[0]
  if (w) parts.push(s.winners.length > 1 ? `${s.winners.length} tied at ${w.points}` : `${w.name} won with ${w.points}`)
  if (s.group_win_pct != null) parts.push(`group ${s.group_win_pct}% ATS`)
  if (s.biggest_upset) parts.push(`${s.biggest_upset.team} the upset (${s.biggest_upset.pick_pct}%)`)
  if (s.season_leader) parts.push(`${s.season_leader.name} leads`)
  return `Week ${s.week}: ${parts.join(' · ')}.`.slice(0, 300)
}

/** Personalized recap email HTML (inline styles for email clients). rundownHtml
 *  is the formatted, admin-edited rundown block. */
export function buildRecapEmailHtml(r: RecapRecipient, post: BlogPost, siteUrl: string, rundownHtml?: string): { html: string; text: string } {
  const b = r.block
  const delta = b.season_rank_prev != null && b.season_rank != null ? b.season_rank_prev - b.season_rank : null
  const move = delta == null || delta === 0 ? '' : delta > 0 ? ` ▲${delta}` : ` ▼${Math.abs(delta)}`
  const rankLine = b.season_rank != null ? `#${b.season_rank} overall${move}` : ''
  const chips = (b.picks || []).map(p => {
    const color = p.result === 'win' ? '#2E7D4F' : p.result === 'loss' ? '#B23A3A' : '#B8860B'
    const bg = p.result === 'win' ? '#E6F4EC' : p.result === 'loss' ? '#FBEAEA' : '#FBF3DC'
    const lock = p.is_lock ? '🔒 ' : ''
    const pts = p.points != null ? ` (${p.points})` : ''
    return `<span style="display:inline-block;margin:2px;padding:3px 9px;border-radius:6px;background:${bg};color:${color};font-size:13px;border:1px solid ${color}33">${lock}${p.team}${pts}</span>`
  }).join(' ')
  const postUrl = `${siteUrl}/blog/${post.slug}`
  const rundown = rundownHtml && rundownHtml.trim()
    ? rundownHtml
    : (post.excerpt?.trim() ? `<p style="font-size:15px;color:#2A2118">${escapeHtml(post.excerpt)}</p>` : '')

  // Personalized "Your Week N" stat card (gold-tinted, distinct from the brown header).
  const statCard = `<div style="background:#FBF3DC;border:1px solid #EAD9AE;border-radius:10px;padding:16px 18px;text-align:center">
    <div style="color:#8a6d1f;font-size:12px;letter-spacing:.1em;text-transform:uppercase;font-weight:800">Your Week ${post.week}</div>
    <div style="font-size:28px;font-weight:800;margin-top:4px;color:#4B3621">${b.wins}–${b.losses}${b.pushes ? `–${b.pushes}` : ''} · ${b.points} pts</div>
    ${rankLine ? `<div style="font-size:13px;color:#8a6d1f;margin-top:4px">${rankLine}</div>` : ''}
  </div>`

  const bodyInner =
    statCard +
    `<p style="font-size:15px;color:#2A2118;margin:16px 0 8px">Hey ${r.display_name} — here's how your six landed:</p>` +
    `<div style="margin:0 0 8px">${chips}</div>` +
    `<div style="border-top:1px solid #E5DFD5;margin-top:18px;padding-top:14px">` +
    `<div style="font-weight:800;color:#4B3621;margin-bottom:6px">The rundown</div>` +
    `${rundown || '<p style="font-size:15px;color:#7A6E60">Read the full recap for the week that was.</p>'}</div>` +
    emailButton(`Read the full Week ${post.week} recap →`, postUrl)

  const html = emailShell({
    subtitle: `Week ${post.week} Recap`,
    bodyHtml: bodyInner,
    preheader: `Your Week ${post.week}: ${b.wins}-${b.losses}, ${b.points} pts`,
  })
  const text = `Your Week ${post.week}: ${b.wins}-${b.losses}, ${b.points} pts${rankLine ? `, ${rankLine}` : ''}. Read the full recap: ${postUrl}`
  return { html, text }
}

/** Send a single test email to `toEmail`, personalized with that user's block if found (else the first recipient's). */
export async function sendRecapTest(toEmail: string, post: BlogPost, rundownHtml: string): Promise<boolean> {
  const recipients = await loadRecipients(post.week!, post.season)
  const mine = recipients.find(r => r.email?.toLowerCase() === toEmail.toLowerCase()) || recipients[0]
  if (!mine) throw new Error('No recipients found for this week (no paid entrants).')
  const sample: RecapRecipient = { ...mine, email: toEmail }
  const { html, text } = buildRecapEmailHtml(sample, post, window.location.origin, rundownHtml || post.email_rundown || '')
  return EmailService.sendEmailDirect(toEmail, `[TEST] Week ${post.week} Recap — your results`, html, text)
}

export interface RecapSendProgress { sent: number; failed: number; total: number }

/** Send the personalized recap to every paid entrant. Throttled; reports progress. */
export async function sendRecapToAll(
  post: BlogPost,
  rundownHtml: string,
  onProgress?: (p: RecapSendProgress) => void
): Promise<RecapSendProgress> {
  const recipients = await loadRecipients(post.week!, post.season)
  const siteUrl = window.location.origin
  const rundown = rundownHtml || post.email_rundown || ''
  const subject = `Week ${post.week} Recap — your results & the rundown 🏈`
  const progress: RecapSendProgress = { sent: 0, failed: 0, total: recipients.length }

  for (const r of recipients) {
    if (!r.email) { progress.failed++; continue }
    try {
      const { html, text } = buildRecapEmailHtml(r, post, siteUrl, rundown)
      const ok = await EmailService.sendEmailDirect(r.email, subject, html, text)
      ok ? progress.sent++ : progress.failed++
    } catch {
      progress.failed++
    }
    onProgress?.({ ...progress })
    await new Promise(res => setTimeout(res, 120)) // throttle for provider rate limits
  }

  // Stamp emailed_at so it can't be sent twice by accident.
  await supabase.from('blog_posts').update({ emailed_at: new Date().toISOString() }).eq('id', post.id)
  return progress
}
