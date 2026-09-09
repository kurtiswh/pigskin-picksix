-- LeagueSafe reconciliation — tie the entry register to the picks being scored.
--
-- leaguesafe_payments IS the LeagueSafe export, column for column (see
-- LeagueSafeUpload.tsx): Owner -> leaguesafe_owner_name, OwnerEmail ->
-- leaguesafe_email, OwnerId -> leaguesafe_owner_id, EntryFee -> entry_fee,
-- Paid -> paid, Pending -> pending, Owes -> owes, Status -> status. So there is
-- no second spreadsheet to line up: run a query here and export the CSV.
--
-- The one check SQL cannot do on itself is whether the import is STALE. Download
-- today's CSV from LeagueSafe and compare its row count and total paid against
-- check 1 before trusting anything else.
--
-- Run in order. Checks 2 and 3 each produce an alarming list; check 4 is what
-- explains most of both, so run it before chasing anyone. Change the season in
-- each query (2026 throughout).

-- ---------------------------------------------------------------------------
-- 1. Does the register add up?
--    Catches a stale import, an unlinked payment, and any gap between what was
--    collected and who is being scored.
-- ---------------------------------------------------------------------------
select
  (select count(*) from leaguesafe_payments where season = 2026)                        as leaguesafe_rows,
  (select count(*) from leaguesafe_payments where season = 2026 and status = 'Paid')    as paid,
  (select count(*) from leaguesafe_payments where season = 2026 and user_id is null)    as no_account_linked,
  (select sum(paid) from leaguesafe_payments where season = 2026)                       as dollars_in,
  (select count(*) from season_leaderboard where season = 2026)                         as on_leaderboard;

-- ---------------------------------------------------------------------------
-- 2. Paid, but not playing.
--    Money taken from someone with no sheet in the system — a genuine no-show,
--    or a player whose picks sit under a different account (see check 4).
-- ---------------------------------------------------------------------------
select lsp.leaguesafe_owner_name, lsp.leaguesafe_email, lsp.paid
from leaguesafe_payments lsp
where lsp.season = 2026 and lsp.status = 'Paid'
  and not exists (select 1 from picks p
                  where p.user_id = lsp.user_id and p.season = 2026 and p.submitted)
  and not exists (select 1 from anonymous_picks a
                  where a.assigned_user_id = lsp.user_id and a.season = 2026)
order by lsp.leaguesafe_owner_name;

-- ---------------------------------------------------------------------------
-- 3. Playing, but not paid.
--    Sheets being scored with no payment behind them. These drop off the board
--    when the grace period closes (see the note at the bottom).
-- ---------------------------------------------------------------------------
with players as (
  select user_id from picks where season = 2026 and submitted
  union
  select assigned_user_id from anonymous_picks
   where season = 2026 and assigned_user_id is not null
)
select u.display_name, lower(u.email) as account_email,
       coalesce((select max(status) from leaguesafe_payments l
                 where l.user_id = u.id and l.season = 2026), 'no record') as leaguesafe_row
from players pl
join users u on u.id = pl.user_id
where not exists (select 1 from leaguesafe_payments l
                  where l.user_id = u.id and l.season = 2026 and l.status = 'Paid')
order by u.display_name;

-- ---------------------------------------------------------------------------
-- 4. The same person under two addresses — the one that matters.
--    Pairs a paid-but-not-playing entry with a playing-but-not-paid account by
--    name or email, which is what a split identity looks like. Matching on name
--    as well as email is the point: Apple private-relay addresses, work vs
--    personal mailboxes, and outright typos in LeagueSafe (a .con TLD, jwheels
--    vs jwheeler) never match on email.
-- ---------------------------------------------------------------------------
with lsp as (select * from leaguesafe_payments where season = 2026),
players as (
  select distinct user_id from (
    select user_id from picks where season = 2026 and submitted
    union select assigned_user_id from anonymous_picks
     where season = 2026 and assigned_user_id is not null) x),
paid_nopicks as (
  select lsp.user_id, lsp.leaguesafe_owner_name nm, lower(lsp.leaguesafe_email) em
  from lsp
  where lsp.status = 'Paid' and lsp.user_id not in (select user_id from players)),
picks_nopay as (
  select p.user_id, u.display_name nm, lower(u.email) em
  from players p join users u on u.id = p.user_id
  where not exists (select 1 from lsp
                    where lsp.user_id = p.user_id and lsp.status = 'Paid'))
select a.nm as paid_as, a.em as paid_email,
       b.nm as playing_as, b.em as playing_email,
       case when a.em = b.em then 'same email' else 'name only' end as matched_on
from paid_nopicks a
join picks_nopay b
  on lower(regexp_replace(a.nm, '[^a-z]', '', 'gi')) = lower(regexp_replace(b.nm, '[^a-z]', '', 'gi'))
  or a.em = b.em
order by a.nm;

-- ---------------------------------------------------------------------------
-- 5. Two entries for one person.
--    A duplicate row in the register itself: charged twice, or two accounts
--    where only one paid.
-- ---------------------------------------------------------------------------
select 'email' as kind, lower(leaguesafe_email) as key, count(*) as rows,
       string_agg(leaguesafe_owner_name || ' (' || status || ')', ' | ') as detail
from leaguesafe_payments where season = 2026 group by 1, 2 having count(*) > 1
union all
select 'name', lower(regexp_replace(leaguesafe_owner_name, '[^a-z]', '', 'gi')), count(*),
       string_agg(leaguesafe_email || ' (' || status || ')', ' | ')
from leaguesafe_payments where season = 2026 group by 1, 2 having count(*) > 1;

-- ---------------------------------------------------------------------------
-- 6. Money that hasn't settled.
--    Dollars that don't match the fee: an overpayment, or a 'Paid' status
--    sitting on a transfer that has not landed (paid 0, pending 40).
-- ---------------------------------------------------------------------------
select leaguesafe_owner_name, leaguesafe_email, entry_fee, paid, pending, owes, status
from leaguesafe_payments
where season = 2026
  and (paid is distinct from entry_fee or pending > 0 or owes > 0)
order by status, leaguesafe_owner_name;

-- ---------------------------------------------------------------------------
-- 7. Two sheets, or two entries?
--    Per week. Two sheets against one paid entry is a duplicate submission;
--    two sheets against two entries is two entries. wr_multiple_pick_sets is
--    admin-gated (migration 238), so run as service role or in the SQL editor.
-- ---------------------------------------------------------------------------
select s.display_name, s.source, s.set_label,
       s.pick_count, s.counted_picks, s.counted_points,
       (select count(*) from leaguesafe_payments l
        where l.user_id = s.user_id and l.season = 2026 and l.status = 'Paid') as paid_entries
from wr_multiple_pick_sets(1, 2026) s
order by s.display_name, s.source;

-- ---------------------------------------------------------------------------
-- Why the leaderboard count exceeds the paid count.
--   The leaderboard views admit an unpaid player while
--     (select max(week) from week_settings where season = ? and games_selected)
--       <= (select grace_period_weeks from app_settings limit 1)
--   Unpaid sheets fall off the board on their own once enough weeks are set up,
--   which is also when an unmerged split identity starts costing a PAID player
--   their standing.
-- ---------------------------------------------------------------------------
select (select grace_period_weeks from app_settings limit 1) as grace_period_weeks,
       (select coalesce(max(week), 0) from week_settings
        where season = 2026 and games_selected)              as weeks_with_games_selected;
