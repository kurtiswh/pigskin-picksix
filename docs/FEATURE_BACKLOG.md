# Pigskin Pick Six — Backlog & Status (single source of truth)

Running list of desired features, status, and where to pick up. Add new ideas here.

Status key: 🔴 not started · 🟡 in progress · 🟢 done · 💭 needs design/decision

_Last updated: 2026-07-05_

---

## ▶ START HERE (next session)

1. 🔴 **Preseason starter touches have a placeholder link.** 3 touches are scheduled
   (Aug 4 / Aug 18 / Sep 1) with `YOUR_LEAGUESAFE_LINK` — as-is they email **~802
   people a broken link**. Fix in Notifications → *Preseason Signup Sequence*: edit
   each with the real LeagueSafe join/pay URL + real dates, or cancel them.
2. 🟢→ **Pre-launch checklist** (can only be fully validated once a week is open):
   - Exercise a test/open week end-to-end: pick submission, **per-game lock
     enforcement**, and the **at-submission anonymous auto-tie** trigger.
   - Set **Week 1 per-game lock times** in Week Setup (lock RLS falls back to the
     week deadline when `custom_lock_time` is null).
   - Confirm a real **pick reminder** actually lands (cron token was fixed via Vault).
   - Verify **Fetch Latest Scores** works under an admin login (invokes the edge fn).
3. Then: **LeagueSafe import** (design below) or finish the cleanup items.

---

## 🟢 Shipped

### Weekly-process / recap / email effort
- **Part A** — single canonical scorer (`calculate_and_update_completed_game`), users-RLS
  recursion fix, `scoring_discrepancies` verification view.
- **Part B** — Week Review close-out hub; anonymous auto-tie (trigger + RPC); per-game
  lock enforcement; 7-pick disqualification; roster/entry cleanup; 6-tab admin reorg;
  Live Scores rebuilt as a game-day health dashboard.
- **Fixed the broken edge-function cron** (was pg_net-missing / typo'd URL / legacy JWT
  → now `http` ext + Vault service key), and **`invoke_edge()` with a 25s timeout** so
  live-scoring/stats/reminders stop logging false timeouts.
- **Weekly recap seeding** — `wr_recap_seed`/`wr_recap_recipients`, Week Review "Generate
  Recap Draft", auto-draft blog post, personalized recap email (each player's results +
  editable rich-text rundown + link).
- **Preseason signup drip** — `preseason_emails` + cron enqueue/send to all emails.
- **Unified email brand shell** — all emails share one look (`src/templates/emailShell.ts`
  + SQL `wrap_email_shell()`); catalog at `docs/mockups/email-catalog.html`.
- **Cleanup** — anon per-game locks, stats-cron cadence, dropped `VITE_SPORTRADAR_API_KEY`,
  vendor chunk-split (main ~1.2MB→674KB), removed dead weekly-results code.

### Parallel workstream (other sessions — summarized from git history)
- **Historic archive 2006–2024** — History page + all-time **Records** boards, tie-aware
  "competition" ranks, percentiles, per-season user rank, "You: #N of M".
- **Profile career/history stats** — year-by-year, Statistics tab redesign.
- **Fun pick analytics** — perfect weeks, contrarian king, hardest/easiest slates.
- **Canonical team names** (historical tie-out); **nickname-variation merge finder**;
  **merge_users fix**.
- **UI redesign** — auth/entry pages, game cards, homepage, nav; large mobile pass.
- **leaguesafe_payments admin RLS fix** (migration 174); People/UserManagement stats
  paginate + scope to season cohort.
- **Partial** retirement of legacy client-side `liveUpdateService` wiring.
- DB: migrations `167_historical_season_standings`, `168_career_stats_views`,
  `169_pick_analytics_views`, `170_grant_stats_views`, `171_include_2025_and_entrants`,
  `172_materialize_stats`, `173_career_ranks`, `174`–`179` (payments RLS, canonical team
  names, fun analytics, merge_users view fix, analytics ranks/slates).

---

## ✨ Open features

### LeagueSafe import streamlining  💭🔴
LeagueSafe has **no API/webhook/auto-export** (verified). Best path = **inbound-email
ingestion** (forward the export CSV → auto-parse → import → auto-match), and/or a
one-click in-app import. Today it's manual CSV via `LeagueSafeUpload`. Full detail was in
this doc's history; recommend inbound-email.

### Preseason sequence content  🔴
Replace the placeholder LeagueSafe link + set real dates on the 3 starter touches (see START HERE).

---

## 🧹 Cleanup / tech debt

- 🟢 Anon per-game locks, stats-cron cadence (every 30 min Thu–Sun), Sportradar key,
  vendor chunk-split, cron http timeout — done.
- 🟡 **Retire legacy live-update code** — partly done (parallel work removed the
  TabbedLeaderboard/GamesPage wiring). Still imported by `GameCompletionTest`,
  `ScheduledFunctionsManager`, `PickProcessingMonitor`, `AdminDashboard` — finish
  removing those + delete the dead components/DB functions.
- 🟡 **2024 bad-state data** — test anon pick removed; 4 completed 2024 games still have
  NULL away scores (need a CFBD re-fetch). Harmless (2024 has zero picks). Low priority.
- 🔴 **Reconcile `auth.uid()` ≠ `public.users.id`** for merged accounts — risky data
  reconciliation (cascades to picks/payments/FKs). Admin recognition already patched via
  JWT email (migration 168) and `merge_users` was fixed in the parallel work; re-audit
  how many players are actually affected before touching ids.
- 🔴 **Account dedupe (~21 pairs)** — parallel work added a nickname-variation merge
  finder; use it + the People merge tool. Needs a per-pair human decision.
- 🔴 Build main chunk still ~674KB — route-based lazy loading if it needs to go lower.

---

## 🗂 Migrations note (read before adding one)
- Migrations are applied **manually via `psql -f`** (there's no runner / no `schema_migrations`
  tracking table). File numbers are **documentation only**.
- The repo has **many duplicate migration numbers historically** (016, 095–121, 131–133,
  147–148, 161, and 167–173 from two concurrent workstreams). All are applied to prod.
- **Next migration: start at 180.**
- Cron uses `invoke_edge(fn)` (reads the service key from Supabase **Vault**, 25s http
  timeout). `pg_net` is NOT installed — use the `http` extension. See memory `pp6-data-quirks`.
