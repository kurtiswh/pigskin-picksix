# Weekly Reconciliation

**Runs:** every week, after scoring completes and before Approve & Publish (phase 7 of [`PART_B_WEEKLY_PROCESS_PLAN.md`](PART_B_WEEKLY_PROCESS_PLAN.md))
**Answers:** is every entry we are scoring paid for, and is every entry we were paid for being scored?

Week Review already answers "is the scoring right". This answers the other half — the money and the identities — because the two go wrong independently and the second one is invisible in the standings until the grace period closes and paid players start dropping off the board.

---

## What actually goes wrong

Three failure families, all of them observed in 2026 week 1:

| Family | What it looks like | Why it happens |
|---|---|---|
| **Split identity** | A paid entry with no picks, and the same person playing on another account with no payment | The LeagueSafe importer resolved the payment address, found no account, and **created one**. The player keeps playing on their real account. |
| **Duplicate sheets** | One player, two pick sheets for the week | An anonymous entry plus an account sheet, or two anonymous entries under different addresses |
| **Untied entries** | An anonymous submission attached to no account | The submission address matches no account outright |

The register itself is rarely wrong. `leaguesafe_payments` **is** the LeagueSafe export, column for column (`Owner` → `leaguesafe_owner_name`, `OwnerEmail` → `leaguesafe_email`, `Status` → `status`, and so on — see `LeagueSafeUpload.tsx`). What goes wrong is which *account* a payment is attached to.

---

## The weekly run

### 1. Confirm the register is current

The one check SQL cannot do on itself. Download today's CSV from LeagueSafe and compare two numbers against check 1 of [`../database/leaguesafe_reconciliation.sql`](../database/leaguesafe_reconciliation.sql): **row count** and **total paid**. If either differs, re-upload before reading anything else — every number below inherits a stale import.

### 2. Build the workbook

**Week Review → Reconciliation workbook → Download for Week N.** Nine filterable tabs, built in the browser from one call to `wr_reconciliation`; the Summary tab says what to act on. It downloads to that device and **carries every player's name, address and payment detail** — treat it accordingly and don't put it anywhere public.

The same workbook from a terminal, if you'd rather (needs `psql`, python and `pip install openpyxl`):

```bash
python3 scripts/build-reconciliation-workbook.py            # active season, latest week
python3 scripts/build-reconciliation-workbook.py 2026 3     # or name them
```

Both write the same nine tabs from the same queries. The generated filenames are gitignored, and must stay that way.

To check a change to the sheet layout without clicking through the admin UI, `node scripts/check-reconciliation-workbook.mjs 2026 1` runs the button's own builder against real data and writes the file — the library rejects a malformed sheet, so a clean run means the button works.

### 3. Work the tabs, in this order

| Tab | Should read | When it doesn't |
|---|---|---|
| **Split identities** | 0 | Run the merge script — step 4 |
| **Playing unpaid** | your known non-payers | Chase them, or accept; they leave the board when the grace period closes |
| **Paid no picks** | genuine no-shows | If a name here looks like a name in *Playing unpaid*, the matcher missed a split — widen it (see below) and re-run |
| **Money issues** | the unpaid, and nothing surprising | A `Paid` row with `pending > 0` and `paid = 0` means the transfer has not landed. `paid > entry_fee` usually means they covered someone else's entry — find whose |
| **Anonymous to tie** | 0 | Tie them from the Anonymous picks row in Week Review — step 5 |
| **Sheet differences** | — | Read it whenever *Duplicate sheets* is non-empty; it is the only place you can see whether the ignored sheet held the same picks |

Order matters between the first three. *Playing unpaid* and *Paid no picks* both look alarming on their own, and **Split identities** is what explains most of both. In 2026 week 1 it explained 23 of 31 and 23 of 43. Never chase anyone before running it.

### 4. Merge split identities

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -v season=2026 -v merged_by=<your users.id> \
  -f database/merge_split_identities.sql
```

Wrap in `BEGIN; … ROLLBACK;` for a dry run first — the NOTICEs still print, so you see exactly which pairs it would merge before it does. It is idempotent (a merged account is neutered and stops matching), it only touches accounts with **no `auth.users` row** so no login can be affected, and it skips anything not a clean one-to-one pair.

Then verify durability — that the next upload will *confirm* the merges rather than undo them:

```sql
select find_user_id_for_email('<the payment address>', 2026);
```

It should return the surviving account for every address you merged.

### 5. Tie anonymous entries

In Week Review → **Anonymous picks**. Each entry lists candidate accounts with the reason each is plausible and whether it paid; one button ties it. Entries marked *auto-tie resolves this one* need only the Auto-tie button. An entry with no candidate gets a search box, or Dismiss with a note if no account exists.

### 6. Read the duplicate sheets

In Week Review → **Duplicate pick sets**. Identical duplicates say so in one line and need no decision. Differing sheets open a game-by-game comparison with the disagreements marked — that is where you decide which sheet is the player's real entry. The row turns amber only on a genuine fault: more than 6 counted picks, or more than one counted lock.

### 7. Re-run and publish

Rebuild the workbook (step 2). Split identities and Anonymous to tie should both read 0. Then Approve & Publish.

---

## The identity model

Why splits happen and how they are resolved — worth understanding before touching a merge.

**One player can hold many addresses:** their login email (`users.email`), the address they paid under (`users.leaguesafe_email`), every address on file (`user_emails`, which is the multi-address store), and the address any past payment carried.

**Resolution order** is `find_user_id_for_email(email, season)`: it reads all four sources, excludes merged tombstones, and prefers the account that **paid** this season, then the one holding **picks**. The importer calls it (as of [`userMatchingFallback.ts`](../src/utils/userMatchingFallback.ts)); so does auto-tie. Anything that needs to turn an address into an account should call it rather than querying `users` directly — that narrow lookup is exactly what created the 23.

**Merge direction is always ghost → the account the player plays from.** `merge_users` neuters the *source* and never touches `auth.users`, so the direction decides whose login survives. Check `auth.users` before merging by hand; the script does it for you and refuses any account that has one.

**Why merges used to come back.** Before the importer used the resolver, a merge held only until the next CSV upload: the importer re-resolved the payment address, still could not see `user_emails` where the merge had recorded it, created a fresh account and moved the payment to it. Cara Capra, Dan Couch, Dan Kucab and Hayden Peterson were each merged once and split again this way. Five more players had *typed their LeagueSafe address into their own profile* and the importer walked past that too. If a merge ever appears to undo itself, this is the first thing to check.

**Widening the matcher.** Pairs are matched on identity *tokens* — display name, LeagueSafe owner name, and the email mailbox with digits and punctuation stripped — plus the definitive case where the payment address is already on the playing account. Matching display names alone missed five real splits (`CARA C` / Cara Capra, `Locksmith` / Kirbo, `Brandon Long` / Brandon L, `Jared B` / Jared Bowling, `Aaron Shisler` / Shis). If you spot a pair by eye that the script misses, the token list in `merge_split_identities.sql` is where to extend it.

---

## Tools

| What | Where |
|---|---|
| The seven register checks, as SQL | [`../database/leaguesafe_reconciliation.sql`](../database/leaguesafe_reconciliation.sql) |
| Workbook, in the app | Week Review → Reconciliation workbook, via `wr_reconciliation` (migration 243) and [`reconciliationWorkbook.ts`](../src/services/reconciliationWorkbook.ts) |
| Workbook, from a terminal | [`../scripts/build-reconciliation-workbook.py`](../scripts/build-reconciliation-workbook.py) |
| Check the builder without a browser | [`../scripts/check-reconciliation-workbook.mjs`](../scripts/check-reconciliation-workbook.mjs) |
| Split-identity merges | [`../database/merge_split_identities.sql`](../database/merge_split_identities.sql) |
| Duplicate sheets + differences | `wr_multiple_pick_sets`, `wr_pick_set_diff` (migrations 238, 239) |
| Anonymous candidates | `wr_anonymous_candidates` (migration 240) |
| Payment gate | `wr_unpaid_submitters` (migration 241 — counts anonymous entries as well as account sheets) |
| Weekly recap figures | `wr_recap_seed` (migration 242 — player-level figures come from `weekly_leaderboard`, so the recap and the standings cannot disagree) |
| Address → account | `find_user_id_for_email` (migrations 234, 235) |

Deploying frontend changes: `npm run deploy` (Cloudflare Workers). Pushing to `main` deploys nothing.

---

## Grace period — why the deadline matters

The leaderboard views admit an unpaid player while

```
(select max(week) from week_settings where season = ? and games_selected)
  <= (select grace_period_weeks from app_settings)
```

`grace_period_weeks` is **2**. So early in the season an unresolved split identity costs nobody anything — the player is on the board regardless. Once weeks-with-games passes the grace period, the same unresolved split **removes a paid player from the standings**. Reconcile before then, not after someone emails about it.

---

## Baseline — 8 September 2026, after week 1

Keep this updated after each cleanup; it is how you tell a new problem from an old one.

| | |
|---|---|
| Register rows / paid / collected | 668 / 663 / $26,480 |
| On the season leaderboard | 651 |
| Split identities | 0 *(23 merged)* |
| Playing unpaid | 8 *(one is the test admin account)* |
| Paid no-shows | 20 |
| Money unsettled | 8 *(5 unpaid, 2 pending transfers, 1 overpayment)* |
| Anonymous entries untied | 0 |
| Players with two sheets in week 1 | 3, all resolved to one entry each |

### Open items

- **Cary Cox holds a third account** — no login, no picks, carrying 2021 and 2022 Paid rows. Not a 2026 problem, so the merge script correctly left it alone, but his history is spread across three rows and only two are joined.
- **Up to 35 accounts across all seasons match the ghost signature** (no login, no picks ever, holds a Paid row). That is an *upper bound* on prior-season splits, not a count — a player who paid, never played and never made a login looks identical. Cleaning it up means running the token match per season against that season's players.
- **A 2025 week 8 entry counts two locks** — Patrick Nagle, whose hand-built combination took a lock from each of his two anonymous sheets. Six picks is legal, two locks is not. Surfaced by the Duplicate pick sets row; historical, so correcting it is a judgement call.
