import { supabase } from '@/lib/supabase'
import { EmailService } from './emailService'
import type { BlogPost } from '@/types/blog'

// The email itself lives in @/templates/recapEmail so the send-email Edge
// Function can render it from a queued job. Re-exported here because callers
// (BlogEditorPage, admin components) already import these names from this file.
export {
  buildRecapEmailHtml,
  getRecapSubject,
  type RecapPickCell,
  type RecapBlock,
  type RecapPicksCta,
  type RecapRecipient,
  type RecapPostRef,
} from '@/templates/recapEmail'
import type { RecapPicksCta } from '@/templates/recapEmail'

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

export async function loadRecapSeed(week: number, season: number): Promise<RecapSeed> {
  const { data, error } = await supabase.rpc('wr_recap_seed', { p_week: week, p_season: season })
  if (error) throw error
  return data as RecapSeed
}

// loadRecipients() is gone: wr_recap_recipients() is now called by
// queue_recap_emails inside the database, so the recipient list and everyone's
// results never travel to the browser just to be mailed back out.

const n =(v: number | null | undefined, d = '—') => (v == null ? d : String(v))

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
 *  is the formatted, admin-edited rundown block. `cta`, when present, appends the
 *  "next week's picks are open" invitation and becomes the primary button. */
/**
 * The "picks are open" invitation for the week after this recap, if that week is
 * actually open. Returns null when it isn't, so the send UI can only offer the
 * combined email when there's really something to point people at.
 */
export async function loadPicksOpenCta(recapWeek: number, season: number): Promise<RecapPicksCta | null> {
  const week = recapWeek + 1
  const { data: ws } = await supabase
    .from('week_settings')
    .select('week, deadline, picks_open, games_selected')
    .eq('season', season)
    .eq('week', week)
    .maybeSingle()
  if (!ws || !ws.picks_open) return null

  const { count } = await supabase
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('season', season)
    .eq('week', week)

  const deadlineStr = ws.deadline
    ? new Date(ws.deadline).toLocaleString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      })
    : null
  return { week, deadlineStr, totalGames: count ?? null }
}

/**
 * Persist the rundown before sending.
 *
 * The server renders the email from blog_posts.email_rundown, so whatever is
 * sitting unsaved in the editor has to be written down first. This also means
 * what went out is always recoverable from the post itself.
 */
async function saveRundown(postId: string, rundownHtml: string): Promise<void> {
  if (!rundownHtml?.trim()) return
  const { error } = await supabase
    .from('blog_posts')
    .update({ email_rundown: rundownHtml })
    .eq('id', postId)
  if (error) throw error
}

/** Send a single test email to `toEmail`, personalized with that user's block if found (else the first recipient's). */
export async function sendRecapTest(
  toEmail: string,
  post: BlogPost,
  rundownHtml: string,
  cta?: RecapPicksCta | null,
  forceNoPicks = false
): Promise<boolean> {
  await saveRundown(post.id, rundownHtml)

  const { data, error } = await supabase.rpc('queue_recap_test', {
    p_post_id: post.id,
    p_to_email: toEmail.trim(),
    p_include_cta: !!cta,
    p_force_no_picks: forceNoPicks,
  })
  if (error) throw error

  const job = data as { job_id?: string; send_token?: string } | null
  if (!job?.job_id) throw new Error('No recipients found for this week (no paid entrants).')
  return EmailService.sendQueuedJob(job.job_id, job.send_token)
}

export interface RecapSendProgress { sent: number; failed: number; total: number }

/** Emails per drain call. Small enough to stay inside authenticated's 8s statement timeout. */
const DRAIN_BATCH = 5

/**
 * Queue the personalized recap for every paid entrant, then drive it to done.
 *
 * Nothing is rendered or sent here. queue_recap_emails writes one job per
 * recipient — each carrying that person's own results — and send_pending_recap
 * asks send-email to send them by id. What crosses the wire from this browser
 * is "send five more", never an email body.
 *
 * Driving the drain from here rather than waiting on the cron is what keeps the
 * progress bar live: small batches land every couple of seconds instead of 40
 * arriving once a minute. If the tab closes the `recap-send` cron finishes the
 * job, so this is the pace-setter, not the engine.
 */
export async function sendRecapToAll(
  post: BlogPost,
  rundownHtml: string,
  onProgress?: (p: RecapSendProgress) => void,
  cta?: RecapPicksCta | null
): Promise<RecapSendProgress> {
  await saveRundown(post.id, rundownHtml)

  const { data: queued, error: queueError } = await supabase.rpc('queue_recap_emails', {
    p_post_id: post.id,
    p_include_cta: !!cta,
  })
  if (queueError) throw queueError

  const total = (queued as { queued?: number } | null)?.queued ?? 0
  const progress: RecapSendProgress = { sent: 0, failed: 0, total }
  onProgress?.({ ...progress })
  if (total === 0) return progress

  for (;;) {
    const { data, error } = await supabase.rpc('send_pending_recap', {
      p_batch: DRAIN_BATCH,
      p_post_id: post.id,
    })

    if (error) {
      // A failed batch is not a failed send — the cron picks up whatever is
      // still pending. Fall back to watching rather than giving up.
      console.warn('Drain batch failed, falling back to polling:', error)
      const counts = await getRecapSendProgress(post.id)
      onProgress?.({ ...counts })
      if (counts.sent + counts.failed >= counts.total) return counts
      await new Promise(res => setTimeout(res, 3000))
      continue
    }

    const batch = data as { sent?: number; failed?: number; remaining?: number } | null
    progress.sent += batch?.sent ?? 0
    progress.failed += batch?.failed ?? 0
    onProgress?.({ ...progress })

    if ((batch?.remaining ?? 0) <= 0) break
  }

  // The cron may have sent some of these too, so finish on the real counts
  // rather than on what this loop happened to account for.
  const final = await getRecapSendProgress(post.id)
  onProgress?.({ ...final })
  return final
}

/** Current queue state for a recap post — drives the progress display. */
export async function getRecapSendProgress(postId: string): Promise<RecapSendProgress> {
  const { data, error } = await supabase.rpc('recap_send_progress', { p_post_id: postId })
  if (error) throw error
  const r = data as { sent?: number; failed?: number; total?: number } | null
  return { sent: r?.sent ?? 0, failed: r?.failed ?? 0, total: r?.total ?? 0 }
}
