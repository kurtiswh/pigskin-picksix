# Pigskin Pick Six — Feature Backlog

Running list of desired features, pre-launch must-dos, and cleanup. Newest ideas
are captured here so they don't get lost; we prioritize/schedule from this list.

Status key: 🔴 not started · 🟡 in progress · 🟢 done · 💭 needs design/decision

_Last updated: 2026-07-04_

---

## 🚦 Pre-launch checklist (do before the season goes live)

These can only be fully validated once a week is actually open with real picks
(it's off-season now). Blocking for kickoff.

- 🔴 **Exercise a live/open week end-to-end.** Open a throwaway test week and verify:
  pick submission works, per-game lock enforcement actually blocks post-lock edits,
  and the at-submission anonymous auto-tie trigger fires correctly.
- 🔴 **Set per-game lock times for Week 1** in Week Setup. The lock RLS falls back to
  the week deadline when `games.custom_lock_time` is null, so Thu/Fri auto-lock needs
  these set.
- 🔴 **Confirm email reminders actually send.** Their cron was on the same broken
  legacy token (now fixed via Vault) — verify a reminder lands before relying on it.
- 🔴 **Verify Live Scores "Fetch Latest Scores"** works under an admin login (it invokes
  the edge function with the user JWT — may need service-role handling if it 401s).

---

## ✨ Feature requests

### 1. Weekly recap seeding + publish-to-list email  💭🔴
After a week ends and is approved/published in Week Review, auto-generate a
"recap seed" — the data outliers/highlights that make writing the weekly post
easier. **We still write the post; this just hands us the raw material.**

Candidate outliers to surface (from picks/games/leaderboards for the week):
- Top weekly scorer(s) and any perfect weeks (6/6)
- Biggest upset pick that hit (lowest-% picked team that covered) and the most
  popular pick that lost
- Lock results (best/worst locks), biggest margin-bonus games
- Biggest risers/fallers on the season leaderboard; new leader; Best-Finish movement
- Worst week / roughest beat

Then: once the post is written and published (ties into the existing `blog_posts`
table + a "publish" action), **email the post to everyone playing for the year**
(the paid/entered list for the active season).

Notes: recap seed = a read-only computed summary (likely a SECURITY DEFINER RPC or
a Week Review "Recap" tab). Publish email reuses the email service + a
"season players" recipient query.

### 2. Preseason signup email sequence  💭🔴
A drip/scheduled email sequence before the season to get people to sign up /
re-up. Ties into the existing email system (Resend + `email_jobs` + cron
`process-reminders`).

Open questions: recipient source (prior-season players? a separate signup/interest
list?), how many touches + timing, and where admins edit the sequence content.

### 3. LeagueSafe auto-pull of registrations  💭🔴
**Goal:** auto-import LeagueSafe registrations/payments instead of manual CSV upload.

**Feasibility (honest read):** LeagueSafe has **no known public/developer API.**
Today the app ingests payments via manual CSV export → `LeagueSafeUpload` →
`leaguesafe_payments` (+ `PaymentMatcher`). Realistic options, best to worst:
- **Streamline the CSV path** (easiest, reliable): make import one click, auto-match
  on upload, flag unmatched. Low risk, no dependency on LeagueSafe internals.
- **Scheduled fetch of an authenticated export URL** (if LeagueSafe exposes a stable
  commissioner export link): a server job pulls the CSV/JSON on a schedule. Fragile
  (breaks if they change the page/auth) and may bump against their ToS — needs
  investigation of what export endpoints exist for a commissioner account.
- **Full API integration**: not currently possible (no documented API).

**Recommendation:** confirm what export/commissioner tools LeagueSafe actually
offers for our account first; default to streamlining the CSV import unless a
stable authenticated export exists.

---

## 🧹 Cleanup / tech debt

- 🔴 **Per-game locks on `anonymous_picks`** — currently only authenticated `picks`
  are lock-enforced server-side (migrations 161/161b).
- 🔴 **`update-game-statistics` cron cadence** — runs once (Sat 16:00 UTC); the Live
  Scores pick counts refresh from it, so consider running it more often on game day.
- 🔴 **Drop unused `VITE_SPORTRADAR_API_KEY`** (not used anywhere).
- 🔴 **Dedupe ~21 paid/unpaid duplicate account pairs** (merge tooling exists in People).
- 🔴 **2024 bad-state data** — a few games in a bad state + 1 test anon pick to clean.
- 🔴 **Build chunk-size warning** — main bundle >500KB; code-split if it grows.
- 🔴 **Retire remaining legacy live-update service code** — `liveUpdateService` /
  `cfbdLiveUpdater` browser paths are no longer used by the UI (Live Scores is now
  server-cron driven); audit and remove what's dead.

---

## 🟢 Recently shipped (for reference)

- Part A: single canonical scorer, RLS recursion fix, scoring verification view.
- Part B: Week Review hub, anonymous auto-tie, per-game locks + disqualification,
  roster cleanup, 6-tab admin reorg, Live Scores health dashboard.
- Fixed the edge-function cron (pg_net/URL/legacy-JWT → Vault) — server-side live
  scoring + email reminders now actually run.
