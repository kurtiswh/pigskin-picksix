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

### 1. Weekly recap seeding + publish-to-list email  🟢 SHIPPED
Built 2026-07: `wr_recap_seed` / `wr_recap_recipients` RPCs (migration 167, applied);
Week Review "Weekly Recap" card (generate seed → create auto-draft); Blog Editor
"Email to players" (test-to-self + send-to-all, personalized with each player's own
results incl. per-game points, + excerpt + link; `emailed_at` guard). Original spec:
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

### 2. Preseason signup email sequence  🟢 SHIPPED
A drip/scheduled email sequence before the season to get people to sign up /
re-up. Ties into the existing email system (Resend + `email_jobs` + cron
`process-reminders`).

Open questions: recipient source (prior-season players? a separate signup/interest
list?), how many touches + timing, and where admins edit the sequence content.

### 3. LeagueSafe auto-pull of registrations  💭🔴
**Goal:** auto-import LeagueSafe registrations/payments instead of manual CSV upload.

**Feasibility (verified 2026-07 via LeagueSafe public docs):** LeagueSafe has
**no API, no webhooks, no scheduled/emailed reports, and no auto-export.** Their
only outbound email is "AutoNag" (nags *unpaid members* to pay — not a data export
to the commissioner). So LeagueSafe cannot *push* registration/payment data to us.
Confirm against our own commissioner dashboard, but nothing public suggests an
auto-export exists. Today the app ingests via manual CSV export → `LeagueSafeUpload`
→ `leaguesafe_payments` (+ `PaymentMatcher`).

Realistic options (best to worst) — all reduce OUR effort, since LeagueSafe won't push:
- **Inbound-email ingestion (recommended):** dedicated address (Resend inbound / a
  Supabase edge fn) that auto-parses a forwarded LeagueSafe CSV, imports, and
  auto-matches. Collapses "export → login → upload → match" to "export → forward one
  email." If LeagueSafe ever does auto-email a report, it drops into this same pipe
  and becomes fully automatic.
- **One-click in-app import:** drag-drop CSV → auto-match → flag unmatched. Simplest.
- **Scheduled fetch of an authenticated export URL** (only if such a stable link
  exists): fragile, possible ToS issue — investigate first, low priority.
- **Full API integration:** not possible (no API).

**Recommendation:** build inbound-email ingestion (and/or one-click import). Fully
hands-off is impossible until LeagueSafe adds a push mechanism.

---

## 🧹 Cleanup / tech debt

- 🟢 **Per-game locks on `anonymous_picks`** — done (migration 172): consolidated 4
  wide-open insert policies into one lock-gated policy (`game_is_open_for_picks`).
- 🟢 **`update-game-statistics` cron cadence** — done (172): now every 30 min Thu–Sun.
- 🟢 **Drop unused `VITE_SPORTRADAR_API_KEY`** — done (removed from vite-env.d.ts + .env.example).
- 🟢 **Build chunk-size** — done: vendor split (react/supabase/quill chunks); main
  bundle ~1.2MB → ~674KB. Route-based lazy loading later if it needs to go lower.
- 🟡 **2024 bad-state data** — test anon pick removed (172). Remaining: 4 completed
  2024 games have NULL away scores (missing data) + 1 in-progress game. 2024 has
  **zero picks**, so these are harmless view-noise; fixing needs a CFBD re-fetch of
  those scores. Low priority.
- 🔴 **Reconcile `auth.uid()` vs `public.users.id` mismatch** — DEFERRED (risky). Some
  merged accounts (kurtiswh@gmail.com, jstovall5) have `public.users.id` ≠ their
  `auth.users.id`; any RLS keyed on `auth.uid() = user_id` (picks, payments) mis-sees
  them. Admin recognition is patched via JWT email (migration 168). Real fix =
  reconcile ids, which cascades across picks/payments/FKs — needs a careful, backed-up
  migration + audit of how many players are affected. Don't rush.
- 🔴 **Dedupe ~21 paid/unpaid duplicate account pairs** — DEFERRED (needs judgment).
  Each pair needs an admin decision on the survivor; use the merge tool in People.
  Not safe to auto-merge blindly.
- 🔴 **Retire legacy live-update service code** — DEFERRED (not actually dead).
  `liveUpdateService`/`cfbdLiveUpdater` are still imported by GameCompletionTest,
  ScheduledFunctionsManager, PickProcessingMonitor, **TabbedLeaderboard** (public),
  GamesPage, AdminDashboard. Retiring means auditing/refactoring each (esp. the
  public leaderboard's browser polling) — a careful task, not a quick delete.

---

## 🟢 Recently shipped (for reference)

- Part A: single canonical scorer, RLS recursion fix, scoring verification view.
- Part B: Week Review hub, anonymous auto-tie, per-game locks + disqualification,
  roster cleanup, 6-tab admin reorg, Live Scores health dashboard.
- Fixed the edge-function cron (pg_net/URL/legacy-JWT → Vault) — server-side live
  scoring + email reminders now actually run.
