/* Generates docs/mockups/email-catalog.html — every email the system sends,
 * rendered with sample data, so we can standardize the look. Run: npx tsx scripts/gen-email-catalog.ts */
import { writeFileSync, mkdirSync } from 'fs'
import { getPickReminderHtml } from '../src/templates/pickReminder'
import { getDeadlineAlertHtml } from '../src/templates/deadlineAlert'
import { getPicksSubmittedHtml } from '../src/templates/picksSubmitted'
import { getWeeklyResultsHtml } from '../src/templates/weeklyResults'
import { getWeekOpenedHtml } from '../src/templates/weekOpened'
import { getMagicLinkHtml } from '../src/templates/magicLink'
import { getPasswordResetHtml } from '../src/templates/passwordReset'

const base = 'https://pigskinpicksix.com'
const who = 'Jordan Mills'
const wk = 5, season = 2025
const deadline = new Date('2025-09-27T16:00:00Z')
const deadlineStr = 'Saturday, Sep 27 at 11:00 AM CT'

const samplePicks = [
  { game: 'Vanderbilt @ Alabama', pick: 'Vanderbilt +7', spread: 7, isLock: false, lockTime: 'Sat 11am' },
  { game: 'Ohio State @ Iowa', pick: 'Ohio State -3', spread: -3, isLock: true, lockTime: 'Sat 11am' },
  { game: 'Oregon @ UCLA', pick: 'Oregon -14', spread: -14, isLock: false, lockTime: 'Sat 11am' },
  { game: 'LSU @ Tennessee', pick: 'LSU +6', spread: 6, isLock: false, lockTime: 'Sat 11am' },
  { game: 'Miami @ FSU', pick: 'Miami -2', spread: -2, isLock: false, lockTime: 'Sat 11am' },
  { game: 'Utah @ Baylor', pick: 'Utah -1', spread: -1, isLock: false, lockTime: 'Sat 11am' },
]

const resultPicks = [
  { game: 'Vanderbilt @ Alabama', pick: 'Vanderbilt +7', result: 'win' as const, points: 20, isLock: false },
  { game: 'Ohio State @ Iowa', pick: 'Ohio State -3', result: 'loss' as const, points: 0, isLock: true },
  { game: 'Oregon @ UCLA', pick: 'Oregon -14', result: 'win' as const, points: 25, isLock: false },
  { game: 'LSU @ Tennessee', pick: 'LSU +6', result: 'push' as const, points: 10, isLock: false },
  { game: 'Miami @ FSU', pick: 'Miami -2', result: 'win' as const, points: 21, isLock: false },
  { game: 'Utah @ Baylor', pick: 'Utah -1', result: 'win' as const, points: 20, isLock: false },
]

// New recap email (reproduced from recapService.buildRecapEmailHtml with sample data)
const recapEmail = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;color:#2A2118">
  <div style="background:#4B3621;color:#fff;border-radius:10px;padding:16px 18px;text-align:center">
    <div style="color:#C9A04E;font-size:12px;letter-spacing:.1em;text-transform:uppercase;font-weight:700">Your Week 5</div>
    <div style="font-size:28px;font-weight:800;margin-top:4px">5–1 · 96 pts</div>
    <div style="font-size:13px;color:#E9DFcd;margin-top:4px">#12 overall ▲6</div>
  </div>
  <p style="font-size:14px">Hey Jordan Mills — here's how your six landed:</p>
  <div style="margin:10px 0">
    <span style="display:inline-block;margin:2px;padding:3px 9px;border-radius:6px;background:#E6F4EC;color:#2E7D4F;font-size:13px;border:1px solid #2E7D4F33">🔒 Ohio State (0)</span>
    <span style="display:inline-block;margin:2px;padding:3px 9px;border-radius:6px;background:#E6F4EC;color:#2E7D4F;font-size:13px;border:1px solid #2E7D4F33">Vanderbilt (20)</span>
    <span style="display:inline-block;margin:2px;padding:3px 9px;border-radius:6px;background:#E6F4EC;color:#2E7D4F;font-size:13px;border:1px solid #2E7D4F33">Oregon (25)</span>
    <span style="display:inline-block;margin:2px;padding:3px 9px;border-radius:6px;background:#FBF3DC;color:#B8860B;font-size:13px;border:1px solid #B8860B33">LSU (10)</span>
    <span style="display:inline-block;margin:2px;padding:3px 9px;border-radius:6px;background:#E6F4EC;color:#2E7D4F;font-size:13px;border:1px solid #2E7D4F33">Miami (21)</span>
    <span style="display:inline-block;margin:2px;padding:3px 9px;border-radius:6px;background:#E6F4EC;color:#2E7D4F;font-size:13px;border:1px solid #2E7D4F33">Utah (20)</span>
  </div>
  <div style="border-top:1px solid #E5DFD5;margin-top:16px;padding-top:14px">
    <div style="font-weight:800;color:#4B3621;margin-bottom:6px">The rundown</div>
    <ul>
      <li><strong>Top of the board:</strong> Davis C took the week with 128 pts.</li>
      <li><strong>The field:</strong> 407 entrants went 54.5% ATS, and just 44% on locks.</li>
      <li><strong>Fade of the week:</strong> Vanderbilt — only 8% took them, and they covered.</li>
      <li><strong>Standings:</strong> Casey Nguyen leads the season.</li>
    </ul>
  </div>
  <a href="#" style="display:block;text-align:center;background:#C9A04E;color:#4B3621;font-weight:800;text-decoration:none;padding:12px;border-radius:9px;margin-top:16px">Read the full Week 5 recap →</a>
  <div style="font-size:11px;color:#7A6E60;text-align:center;margin-top:16px">You're getting this because you're playing Pigskin Pick Six 2025.</div>
</div>`

// Preseason signup email (default body template)
const preseasonEmail = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#2A2118">
  <p>Hey Jordan Mills,</p>
  <p>Pigskin Pick Six is back for another season! Here's how to get in:</p>
  <ul>
    <li><strong>Pay your entry on LeagueSafe:</strong> <a href="#">join &amp; pay here</a></li>
    <li><strong>Register / log in:</strong> <a href="https://pigskinpicksix.com">pigskinpicksix.com</a></li>
    <li><strong>Share your LeagueSafe payment ID / email</strong> so we can match your payment — just reply to this email.</li>
  </ul>
  <p>See you on the gridiron. 🏈</p>
</div>`

const emails: { name: string; note: string; html: string }[] = [
  { name: 'Pick Reminder', note: 'Cron · before each deadline', html: getPickReminderHtml({ userDisplayName: who, week: wk, season, baseUrl: base, deadline, deadlineStr }) },
  { name: 'Deadline Alert', note: 'Cron · hours before deadline', html: getDeadlineAlertHtml({ userDisplayName: who, week: wk, season, baseUrl: base, deadline, deadlineStr, hoursLeft: 2 }) },
  { name: 'Pick Confirmation', note: 'On pick submission', html: getPicksSubmittedHtml({ userDisplayName: who, week: wk, season, baseUrl: base, picks: samplePicks, submittedAt: new Date(), submittedStr: 'Fri, Sep 26 at 8:14 PM CT' }) },
  { name: 'Week Opened', note: 'When a week opens for picks', html: getWeekOpenedHtml({ week: wk, season, deadline, deadlineStr, totalGames: 15, baseUrl: base }) },
  { name: 'Weekly Results (RETIRED)', note: 'Old per-player results — replaced by Recap', html: getWeeklyResultsHtml({ userDisplayName: who, week: wk, season, baseUrl: base, userStats: { weeklyPoints: 96, weeklyRank: 12, totalPlayers: 407, seasonPoints: 96, seasonRank: 12, picks: resultPicks } }) },
  { name: 'Weekly Recap (NEW)', note: 'Personalized results + rundown + link', html: recapEmail },
  { name: 'Preseason Signup', note: 'Scheduled drip · admin-authored', html: preseasonEmail },
  { name: 'Magic Link', note: 'Passwordless login', html: getMagicLinkHtml({ userDisplayName: who, magicLinkUrl: '#' }) },
  { name: 'Password Reset', note: 'Reset request', html: getPasswordResetHtml({ userDisplayName: who, resetUrl: '#' }) },
]

const cards = emails.map((e, i) => `
  <section style="margin-bottom:36px">
    <div style="display:flex;align-items:baseline;gap:10px;border-bottom:2px solid #C9A04E;padding-bottom:6px;margin-bottom:14px">
      <span style="background:#4B3621;color:#fff;border-radius:6px;padding:2px 9px;font-weight:800;font-size:13px">${i + 1}</span>
      <h2 style="margin:0;color:#4B3621;font-size:20px">${e.name}</h2>
      <span style="color:#7A6E60;font-size:13px">— ${e.note}</span>
    </div>
    <div style="border:1px solid #E5DFD5;border-radius:10px;overflow:hidden;background:#fff">${e.html}</div>
  </section>`).join('')

const page = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>PP6 — Email Catalog</title>
<style>body{margin:0;background:#F0EEE8;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#2A2118}
.wrap{max-width:760px;margin:0 auto;padding:28px 20px 60px}
h1{color:#4B3621;margin:0 0 4px}
.intro{background:#fff;border:1px solid #E5DFD5;border-radius:10px;padding:14px 16px;margin:16px 0 28px;font-size:14px;line-height:1.5}
.intro b{color:#4B3621}
code{background:#efe9df;border-radius:4px;padding:1px 5px;font-size:12px}</style></head>
<body><div class="wrap">
<h1>🏈 Pigskin Pick Six — Email Catalog</h1>
<div style="color:#7A6E60;font-size:13px">Every email the system can send, rendered with sample data. Generated for standardizing the look.</div>
<div class="intro">
  <b>Consistency notes to resolve:</b>
  <ul style="margin:8px 0 0">
    <li>Header brown differs: most templates use <code>#8B4513</code> (saddle brown), but the brand / new emails use <code>#4B3621</code> (Pigskin Brown) with gold <code>#C9A04E</code>.</li>
    <li>Fonts differ: legacy templates use <code>Arial</code>; the recap uses the system font stack.</li>
    <li>Buttons/footers vary (brown vs green buttons, different sign-offs).</li>
    <li>Goal: one shared header, palette (Pigskin Brown + Goal-Post Gold), font, button style, and footer across all.</li>
  </ul>
</div>
${cards}
</div></body></html>`

mkdirSync('docs/mockups', { recursive: true })
writeFileSync('docs/mockups/email-catalog.html', page)
console.log('Wrote docs/mockups/email-catalog.html with', emails.length, 'emails')
