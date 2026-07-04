# Part B — Weekly Process Rework (Plan)

**Status:** Planning · **Depends on:** Part A (scoring consolidation) ✅ done
**Goal:** One trustworthy, mostly-automated path from *pick submission → final admin approval → published leaderboard*, so we never again "score things wrong" and manually chase mistakes each week.

Companion visual: [`docs/mockups/part-b-weekly-process.html`](mockups/part-b-weekly-process.html) — open in a browser. It contains the end-to-end process walkthrough plus mockups of the new screens described below.

---

## The problem we're solving

Last season scoring produced wrong results and we patched them by hand each week. Root causes we've since confirmed and (in Part A) partly fixed:

- Multiple competing scorers (a browser TS scorer + the DB path) writing points.
- Stale `games.winner_against_spread` / `margin_bonus` columns that the pick trigger re-reads.
- Manual scorer buttons scattered across admin screens with no verification gate.
- Anonymous picks assigned through several different code paths.
- No single "is this week correct? approve it" step — publishing was implicit.

Part A made the **DB the single source of truth** for scoring (`calculate_and_update_completed_game` → `process_picks_for_completed_game`) and added the `scoring_discrepancies` verification view. Part B builds the **process and UI** on top of that so the whole week runs through one reviewed pipeline.

---

## The target weekly pipeline (8 phases)

| # | Phase | Actor | System state (`week_settings`) |
|---|-------|-------|-------------------------------|
| 1 | Build week | Admin | `games_selected = true` |
| 2 | Submit picks | Players (auth + anon) | `picks_open = true` |
| 3 | Locks enforce | System | per-game locks; `games_locked = true` when all locked |
| 4 | Games play | — (CFBD) | — |
| 5 | Live scoring | System (Edge Function only) | `scoring_complete = true` when all games scored |
| 6 | Auto-verify | System | discrepancies = 0, anon auto-tied, disqualifications computed |
| 7 | Week Review | Admin | review queue cleared |
| 8 | Approve & publish | Admin | `leaderboard_complete = true` → leaderboard visible |

Everything below is organized as workstreams that build this pipeline.

---

## Workstream B1 — Single live-update writer

**Intent:** exactly one thing writes scores/points: the `live-score-updater` Edge Function calling the canonical RPC. Everything else becomes read-only status or a guarded re-run of that same RPC.

**Current state (from code map):**
- Canonical: `supabase/functions/live-score-updater/index.ts` → RPC `calculate_and_update_completed_game` (migration 139).
- Redundant writers still present: `ScoreManager.tsx` "Process Completed Games" button, `GameCompletionTest.tsx`, and scheduled-function triggers.

**Changes:**
1. `ScoreManager.tsx` → convert to **read-only monitor**: last run time, games scored / pending, per-game status, and the discrepancy count. Keep ONE guarded button: "Re-run scoring for Week N" that calls the *same* RPC per unscored/mismatched game (no bespoke logic).
2. Remove `GameCompletionTest.tsx` from the admin UI (keep as a dev-only artifact or delete).
3. Audit and drop any remaining DB scoring functions that duplicate `calculate_and_update_completed_game` (extend migration 157's cleanup). Verify zero references first.
4. Confirm the Edge Function is the only scheduled caller; document its cron in the plan/repo.

**Acceptance:** grep shows only the Edge Function + the one guarded admin button invoke the scoring RPC; no code writes `picks.points_earned` / `result` directly.

---

## Workstream B2 — Auto-verification + "Week Review" screen

**Intent:** a single admin screen that answers "is this week correct, and can I publish it?" — built on `scoring_discrepancies` (migration 158).

**New component:** `src/components/WeekReview.tsx`, surfaced as a **new "Week Review" admin tab** (replaces the ad-hoc "Score Updates" tab as the weekly hub). Mockup in the HTML file.

**What it shows for the selected week (a checklist that must go green before publish):**
1. **Games scored** — X/Y completed games have `winner_against_spread`; lists any pending.
2. **Scoring integrity** — count from `scoring_discrepancies WHERE season/week`; 0 = green. Any rows shown with the human-readable `issue` string + a "re-run scoring" action.
3. **Anonymous picks** — unresolved ties (submitted, unassigned, matchable) with one-click resolve; see B3.
4. **Disqualifications** — players with >6 counted picks flagged, with the computed drop; see B4.
5. **Payment gate** — submitters who are unpaid (won't appear on leaderboard) for awareness; links to PickManagement.
6. **Publish** — single "Approve & Publish Week N" button, enabled only when 1–2 are green. Sets `scoring_complete = true` and `leaderboard_complete = true` atomically.

**Acceptance:** an admin can run an entire week's close-out from this one screen; publish is blocked while discrepancies or unscored games exist.

---

## Workstream B3 — Anonymous pick auto-tie (one path)

**Intent:** collapse the several assignment paths into one deterministic rule, and guarantee the anonymous page never leaks prior picks.

**Current state:** assignment happens via `autoAssignPicksByEmail()` (PickManagement), manual assign, and `userMergeService`; validation via `validation_status`.

**Changes:**
1. **Single tie rule** (run at submission and re-checkable in Week Review): match `anonymous_picks.email` against `users.email`, `users.leaguesafe_email`, and `leaguesafe_payments.leaguesafe_email`. On match set `assigned_user_id`; set `show_on_leaderboard = true` **only if that user is `Paid`** for the season, else `false` (grace-period rules still apply for early weeks).
2. Week Review surfaces only the **unresolved** remainder for manual action — no more scattered assignment UIs.
3. **Anonymous page hardening:** audit `AnonymousPicksPage.tsx` to confirm it *never* queries or renders previously-submitted picks for that email (fresh sheet every time). Add a guard/test. This is a hard requirement.

**Acceptance:** a paid, email-matching anonymous entry auto-appears on the leaderboard with no admin action; the anonymous page shows a blank sheet even for a returning email.

---

## Workstream B4 — Per-game lock enforcement + disqualification

**Intent:** locks are enforced server-side (not just UI), and the "7-pick" disqualification is computed automatically after games.

**Lock rules (confirmed):**
- Thursday/Friday games **auto-lock** at their lock time (per `games.custom_lock_time` or computed 6pm CT rule in `WeekControls`).
- Saturday+ games editable until the Saturday deadline.
- A Saturday submission "overrides" all **non-locked** picks.

**Changes:**
1. **Server-side lock enforcement:** tighten the picks RLS / add a trigger so a pick for a game whose lock time has passed cannot be inserted or updated (today deadline enforcement is coarse `week_settings.deadline`; we need per-game via `custom_lock_time`). Applies to auth + anon inserts.
2. **Disqualification computation** (after all games complete, surfaced in Week Review):
   - If a player has locked Thu/Fri picks AND then submitted a full new Saturday set, they can end up with 7 counted picks (locked pick(s) + 6 new).
   - Rule: with >6 counted picks, drop the **highest-value** newly-submitted (Saturday) pick as a penalty for over-submitting, returning the total to 6. A **locked pick is never the drop** — if the highest-value pick is locked, drop the next-highest non-locked pick instead.
   - Computed **after** games so point values are known; covers both directions; shown in Week Review for admin confirmation before publish. Nothing is deleted — the dropped pick is marked not-counted and excluded from totals.
3. **Anon→user continuity:** when the anonymous entrant logs in, their submitted anonymous picks appear as their existing picks (Thu/Fri already auto-locked, only Saturday editable). The *submission* page stays blank (B3); this is about the logged-in pick sheet reflecting prior submissions.

**Acceptance:** a pick cannot be saved after its game's lock time via any client; a 7-pick situation is auto-flagged with a proposed drop in Week Review.

---

## Workstream B5 — Roster / entry management

**Intent:** stop stale/never-entered accounts from cluttering admin and being emailed after the season is underway.

**Changes:**
1. **After week 2**, block/notify on emails that were never entered (grace period ends) — no more reminders to non-entrants.
2. Filter `UserManagement` default view to **"played this season"** (has picks or a payment for the active season), with a toggle to show all.

**Acceptance:** admin lists and notifications default to actual participants once the season is live.

---

## Sequencing (recommended)

1. **B2 Week Review + B1 single writer** — highest safety value before games start; gives the close-out hub and kills competing writers.
2. **B3 anonymous auto-tie** — removes weekly manual assignment toil; do the anon-page leak audit early (hard requirement).
3. **B4 locks + disqualification** — most logic-heavy; needs careful testing against last season's data.
4. **B5 roster/entry cleanup** — polish, do last.

Each workstream ships independently and is verifiable against 2025 data (which we know is correct) using `scoring_discrepancies` as the oracle.

---

## Guardrails (carried from Part A)

- **Never change stored historical values.** All migrations back up first (see the `backups` schema pattern in migration 159) and are proven with checksums before/after.
- Views that read `leaguesafe_payments` must stay `security_invoker = false`.
- Admin RLS should move to the `is_current_user_admin()` helper (migration 156) rather than inline `EXISTS` subqueries.
