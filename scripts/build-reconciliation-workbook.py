#!/usr/bin/env python3
"""Build the LeagueSafe reconciliation workbook from the live database.

    python3 scripts/build-reconciliation-workbook.py [season] [week]
    python3 scripts/build-reconciliation-workbook.py 2026 3

Defaults to the current season and its latest week with games selected.
Needs openpyxl (pip install openpyxl), psql on PATH, and SUPABASE_DB_URL in
.env. The workbook carries player names, addresses and payment detail, so it
is written to a gitignored filename -- keep it out of the repo and out of
anywhere public. See docs/WEEKLY_RECONCILIATION.md.
"""
import csv, io, os, subprocess, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = subprocess.run(
    f"grep '^SUPABASE_DB_URL=' '{os.path.join(REPO, '.env')}' | cut -d= -f2-",
    shell=True, capture_output=True, text=True).stdout.strip()
if not DB:
    sys.exit("SUPABASE_DB_URL not found in .env")


def scalar(sql):
    r = subprocess.run(["psql", DB, "-tAc", sql], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"query failed:\n{r.stderr}")
    return r.stdout.strip()


SEASON = int(sys.argv[1]) if len(sys.argv) > 1 else int(
    scalar("select active_season from app_settings limit 1"))
WEEK = int(sys.argv[2]) if len(sys.argv) > 2 else int(
    scalar(f"select coalesce(max(week), 1) from week_settings"
           f" where season = {SEASON} and games_selected") or 1)
print(f"building reconciliation workbook for season {SEASON}, week {WEEK}")

BROWN, GOLD, INK = "4B3621", "C9A04E", "241C13"
HDR = PatternFill("solid", fgColor=BROWN)
BAD = PatternFill("solid", fgColor="FBE9EC")
WARN = PatternFill("solid", fgColor="FFF5E2")
OK = PatternFill("solid", fgColor="E6F4EA")
THIN = Border(bottom=Side(style="thin", color="E3DCD1"))


def q(sql):
    r = subprocess.run(["psql", DB, "-P", "pager=off", "--csv", "-c", sql],
                       capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"query failed:\n{r.stderr}\n{sql[:400]}")
    rows = list(csv.reader(io.StringIO(r.stdout)))
    return rows[0], rows[1:]


COUNTS = {}


def sheet(wb, name, header, rows, widths=None, flag_col=None, note=None):
    COUNTS[name] = len(rows)
    ws = wb.create_sheet(name)
    r0 = 1
    if note:
        ws.cell(1, 1, note).font = Font(italic=True, color="5C5145", size=10)
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max(len(header), 2))
        r0 = 3
    for c, h in enumerate(header, 1):
        cell = ws.cell(r0, c, h.replace("_", " "))
        cell.font = Font(bold=True, color="FFFFFF", size=10)
        cell.fill = HDR
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    ws.row_dimensions[r0].height = 26
    for i, row in enumerate(rows, r0 + 1):
        for c, v in enumerate(row, 1):
            cell = ws.cell(i, c, num(v))
            cell.border = THIN
            cell.font = Font(size=10)
        if flag_col is not None and row[flag_col].strip():
            fill = BAD if "unpaid" in row[flag_col] or "not paid" in row[flag_col] else WARN
            for c in range(1, len(header) + 1):
                ws.cell(i, c).fill = fill
    ws.freeze_panes = ws.cell(r0 + 1, 1)
    if rows:
        ws.auto_filter.ref = f"A{r0}:{get_column_letter(len(header))}{r0 + len(rows)}"
    for c, h in enumerate(header, 1):
        w = (widths or {}).get(h)
        if not w:
            longest = max([len(h)] + [len(str(r[c - 1])) for r in rows[:400]]) if rows else len(h)
            w = min(max(longest + 2, 9), 42)
        ws.column_dimensions[get_column_letter(c)].width = w
    return ws


def num(v):
    if v is None or v == "":
        return ""
    if v in ("t", "f"):
        return "yes" if v == "t" else "no"
    try:
        return int(v)
    except ValueError:
        pass
    try:
        return float(v)
    except ValueError:
        return v


LSP = f"leaguesafe_payments where season = {SEASON}"
PLAYERS = f"""select distinct user_id from (
  select user_id from picks where season={SEASON} and submitted
  union select assigned_user_id from anonymous_picks
   where season={SEASON} and assigned_user_id is not null) x"""
# Split identities are found on any identity token either side carries -- the
# display name, the LeagueSafe owner name, or the email mailbox with digits
# stripped -- plus the definitive case where the payment address is already on
# the playing account. Matching display names alone missed five: CARA C / Cara
# Capra, Locksmith / Kirbo, Brandon Long / Brandon L, Jared B / Jared Bowling,
# Aaron Shisler / Shis.
SPLIT = f"""
with lsp as (select * from {LSP}),
players as ({PLAYERS}),
paid_nopicks as (select lsp.user_id, lsp.leaguesafe_owner_name nm, lower(lsp.leaguesafe_email) em,
    lsp.paid, u.display_name acct_nm
  from lsp join users u on u.id=lsp.user_id
  where lsp.status='Paid' and lsp.user_id not in (select user_id from players)),
picks_nopay as (select p.user_id, u.display_name nm, lower(u.email) em
  from players p join users u on u.id=p.user_id
  where not exists (select 1 from lsp where lsp.user_id=p.user_id and lsp.status='Paid')),
paid_tokens as (select user_id, tok from paid_nopicks,
  lateral (values (lower(regexp_replace(nm,'[^a-z]','','gi'))),
                  (lower(regexp_replace(acct_nm,'[^a-z]','','gi'))),
                  (lower(regexp_replace(split_part(em,'@',1),'[^a-z]','','gi')))) t(tok)
  where length(tok) >= 5),
play_tokens as (select user_id, tok from picks_nopay,
  lateral (values (lower(regexp_replace(nm,'[^a-z]','','gi'))),
                  (lower(regexp_replace(split_part(em,'@',1),'[^a-z]','','gi')))) t(tok)
  where length(tok) >= 5),
pairs as (
  select a.user_id paid_id, a.nm paid_nm, a.em paid_em, a.paid dollars,
         b.user_id play_id, b.nm play_nm, b.em play_em,
    min(case when exists (select 1 from user_emails ue
                          where ue.user_id=b.user_id and lower(ue.email)=a.em) then 1
             when at.tok = bt.tok then 2 else 3 end) rank,
    min(case when exists (select 1 from user_emails ue
                          where ue.user_id=b.user_id and lower(ue.email)=a.em)
               then 'payment address already on the playing account ('
                    || coalesce((select ue.email_type from user_emails ue
                                 where ue.user_id=b.user_id and lower(ue.email)=a.em limit 1),'?') || ')'
             when at.tok = bt.tok then 'identity token matches: ' || at.tok
             else 'token is a prefix: ' || at.tok || ' / ' || bt.tok end) evidence
  from paid_nopicks a
  join picks_nopay b on true
  join paid_tokens at on at.user_id = a.user_id
  join play_tokens bt on bt.user_id = b.user_id
  where at.tok = bt.tok or at.tok like bt.tok || '%' or bt.tok like at.tok || '%'
     or exists (select 1 from user_emails ue where ue.user_id=b.user_id and lower(ue.email)=a.em)
  group by a.user_id, a.nm, a.em, a.paid, b.user_id, b.nm, b.em)
"""

wb = Workbook()
wb.remove(wb.active)

# ---------------------------------------------------------------- 1. register
h, rows = q(f"""{SPLIT},
matched as (select paid_id a_id, play_id b_id, play_nm b_nm, play_em b_em from pairs),
dupname as (select lower(regexp_replace(leaguesafe_owner_name,'[^a-z]','','gi')) k
  from lsp group by 1 having count(*)>1),
multi as (select distinct user_id from wr_multiple_pick_sets({WEEK}, {SEASON}))
select lsp.leaguesafe_owner_name as leaguesafe_owner, lower(lsp.leaguesafe_email) as leaguesafe_email,
  lsp.status, lsp.entry_fee, lsp.paid, lsp.pending, lsp.owes,
  u.display_name as account_name, lower(u.email) as account_email,
  (select count(*) from picks p where p.user_id=lsp.user_id and p.season={SEASON} and p.submitted) as submitted_picks,
  (select count(*) from anonymous_picks a where a.assigned_user_id=lsp.user_id and a.season={SEASON}) as anon_picks,
  (select count(*) from season_leaderboard sl where sl.user_id=lsp.user_id and sl.season={SEASON}) as on_leaderboard,
  (select coalesce(sum(total_points),0) from season_leaderboard sl where sl.user_id=lsp.user_id and sl.season={SEASON}) as points,
  btrim(concat_ws(', ',
    case when lsp.status <> 'Paid' then 'NOT PAID' end,
    case when lsp.status='Paid' and lsp.paid is distinct from lsp.entry_fee then 'paid <> entry fee' end,
    case when lsp.pending > 0 then 'transfer pending' end,
    case when lsp.status='Paid' and lsp.user_id not in (select user_id from players)
              and lsp.user_id not in (select a_id from matched) then 'paid, no picks' end,
    case when lsp.user_id in (select a_id from matched)
      then 'SPLIT IDENTITY - playing as ' || (select min(b_nm||' <'||b_em||'>') from matched m where m.a_id=lsp.user_id) end,
    case when lower(regexp_replace(lsp.leaguesafe_owner_name,'[^a-z]','','gi')) in (select k from dupname) then 'duplicate name in register' end,
    case when lsp.user_id in (select user_id from multi) then 'two sheets week {WEEK}' end
  )) as issues
from lsp join users u on u.id = lsp.user_id
order by (btrim(concat_ws('',
    case when lsp.status <> 'Paid' then 'x' end,
    case when lsp.status='Paid' and lsp.paid is distinct from lsp.entry_fee then 'x' end,
    case when lsp.user_id in (select a_id from matched) then 'x' end)) <> '') desc,
  lsp.leaguesafe_owner_name""")
sheet(wb, "Register", h, rows, flag_col=len(h) - 1,
      note=f"Every LeagueSafe row for {SEASON}, joined to the account and its picks. Flagged rows sort to the top; filter the Issues column.",
      widths={"leaguesafe_email": 34, "account_email": 34, "issues": 60, "leaguesafe_owner": 22, "account_name": 22})

# --------------------------------------------------------- 2. split identities
h, rows = q(f"""{SPLIT}
select paid_nm as paid_as, paid_em as payment_email, dollars,
  play_nm as playing_as, play_em as account_email,
  evidence,
  (select count(*) from auth.users au where au.id = paid_id) as ghost_can_log_in,
  (select count(*) from auth.users au where au.id = play_id) as player_can_log_in,
  (select count(*) from picks p where p.user_id=play_id and p.season={SEASON} and p.submitted) as submitted_picks,
  (select count(*) from anonymous_picks x where x.assigned_user_id=play_id and x.season={SEASON}) as anon_picks,
  paid_id as merge_this_account, play_id as into_this_account
from pairs order by rank, paid_nm""")
sheet(wb, "Split identities", h, rows,
      note="Paid under the left address, playing under the right. Merge the ghost INTO the playing account: no ghost has a login, so nothing breaks. Fix the importer first or the next CSV upload undoes it.",
      widths={"payment_email": 34, "account_email": 34, "evidence": 52, "merge_this_account": 38, "into_this_account": 38})

# ------------------------------------------------------------ 3. playing unpaid
h, rows = q(f"""{SPLIT},
matched as (select distinct play_id user_id from pairs)
select b.nm as playing_as, b.em as account_email,
  coalesce((select max(status) from lsp where lsp.user_id=b.user_id),'no record') as leaguesafe_row,
  coalesce((select max(owes) from lsp where lsp.user_id=b.user_id),0) as owes,
  (select count(*) from picks p where p.user_id=b.user_id and p.season={SEASON} and p.submitted) as submitted_picks,
  (select count(*) from anonymous_picks x where x.assigned_user_id=b.user_id and x.season={SEASON}) as anon_picks,
  (select coalesce(sum(total_points),0) from season_leaderboard sl where sl.user_id=b.user_id and sl.season={SEASON}) as points_on_board
from picks_nopay b where b.user_id not in (select user_id from matched) order by b.nm""")
sheet(wb, "Playing unpaid", h, rows,
      note="Sheets being scored with no payment traceable anywhere, after the split identities are accounted for. These drop off the board when the grace period closes.",
      widths={"account_email": 34})

# ------------------------------------------------------------ 4. paid no picks
h, rows = q(f"""{SPLIT},
matched as (select distinct paid_id user_id from pairs)
select a.nm as paid_as, a.em as payment_email, a.paid as dollars,
  u.display_name as account_name, lower(u.email) as account_email
from paid_nopicks a join users u on u.id=a.user_id
where a.user_id not in (select user_id from matched) order by a.nm""")
sheet(wb, "Paid no picks", h, rows,
      note="Paid, and no sheet anywhere in the system under any address we can find. Genuine no-shows unless they play later.",
      widths={"payment_email": 34, "account_email": 34})

# -------------------------------------------------------------- 5. money issues
h, rows = q(f"""select leaguesafe_owner_name as leaguesafe_owner, lower(leaguesafe_email) as leaguesafe_email,
  status, entry_fee, paid, pending, owes,
  case when paid > entry_fee then 'overpaid - covering another entry?'
       when status='Paid' and pending > 0 and paid = 0 then 'marked Paid, transfer not landed'
       when status <> 'Paid' then 'owes the entry fee'
       else 'short' end as reading
from {LSP} and (paid is distinct from entry_fee or pending > 0 or owes > 0)
order by status, leaguesafe_owner_name""")
sheet(wb, "Money issues", h, rows,
      note="Dollars that do not match the entry fee. 'Paid' with a pending transfer means the money is not in yet.",
      widths={"leaguesafe_email": 34, "reading": 38})

# ------------------------------------------------------------ 6. duplicate sets
h, rows = q(f"""select s.display_name as player, s.account_email, s.source as sheet, s.set_label as submitted_under,
  s.pick_count, s.counted_picks, s.lock_count, s.counted_locks, s.is_submitted,
  s.points as points_on_file, s.counted_points, s.counts_for_leaderboard as counts,
  s.last_submitted_at as submitted_at
from wr_multiple_pick_sets({WEEK}, {SEASON}) s order by s.display_name, s.source""")
sheet(wb, f"Duplicate sheets W{WEEK}", h, rows,
      note=f"Week {WEEK}: every sheet on file for a player who has more than one. Counting is per pick. The next tab shows where the sheets actually differ.",
      widths={"account_email": 30, "submitted_under": 30, "submitted_at": 20})

# ------------------------------------------------------------- 7. sheet diff
h, rows = q(f"""
with sets as (
  select p.user_id, 'authenticated' src, lower(u.email) label, p.game_id, p.selected_team, p.is_lock,
         p.result::text, p.points_earned,
         (p.submitted and p.show_on_leaderboard and not p.disqualified) counted
  from picks p join users u on u.id=p.user_id
  where p.season={SEASON} and p.week={WEEK}
  union all
  select ap.assigned_user_id, 'anonymous', lower(ap.email), ap.game_id, ap.selected_team, ap.is_lock,
         ap.result::text, ap.points_earned,
         (ap.show_on_leaderboard and not coalesce(ap.disqualified,false)
          and not exists (select 1 from picks p where p.user_id=ap.assigned_user_id
                           and p.week={WEEK} and p.season={SEASON} and p.submitted and p.show_on_leaderboard))
  from anonymous_picks ap where ap.season={SEASON} and ap.week={WEEK} and ap.assigned_user_id is not null),
multi as (select distinct user_id from wr_multiple_pick_sets({WEEK}, {SEASON})),
games as (select id, away_team||' @ '||home_team matchup, kickoff_time from games where season={SEASON} and week={WEEK})
select u.display_name as player, g.matchup,
  max(case when s.src='authenticated' then s.selected_team||case when s.is_lock then ' (LOCK)' else '' end end) as account_sheet,
  max(case when s.src='anonymous' then s.selected_team||case when s.is_lock then ' (LOCK)' else '' end end) as anonymous_entry,
  case
    when count(distinct s.src)=1 then 'only on the '||max(s.src)||' sheet'
    when count(distinct s.selected_team)>1 then 'DIFFERENT TEAM'
    when count(distinct s.is_lock)>1 then 'different lock'
    else 'same' end as difference,
  max(case when s.counted then s.result end) as counted_result,
  max(case when s.counted then s.points_earned end) as counted_points
from sets s
join u_all u on u.id = s.user_id
join games g on g.id = s.game_id
where s.user_id in (select user_id from multi)
group by u.display_name, g.matchup, g.kickoff_time
order by u.display_name, g.kickoff_time""".replace("u_all", "users"))
sheet(wb, "Sheet differences", h, rows, flag_col=4,
      note="One row per game per player, with each sheet's pick side by side. 'DIFFERENT TEAM' is where the two sheets actually disagree.",
      widths={"matchup": 34, "account_sheet": 24, "anonymous_entry": 24, "difference": 26})

# --------------------------------------------------------- 8. anonymous to tie
h, rows = q(f"""
with un as (select lower(ap.email) em, max(ap.name) nm, count(*) picks,
                   count(*) filter (where ap.is_lock) locks, max(ap.submitted_at) at
            from anonymous_picks ap
            where ap.season={SEASON} and ap.week={WEEK} and ap.submitted and ap.assigned_user_id is null
              and coalesce(ap.validation_status,'pending') <> 'rejected'
            group by 1)
select un.nm as entry_name, un.em as entry_email, un.picks, un.locks, un.at as submitted_at,
  u.display_name as suggested_account, lower(u.email) as suggested_email,
  case when u.id is null then 'no account found'
       when lower(u.email)=un.em then 'exact email'
       else 'resolved via merged address / payment record' end as basis,
  exists(select 1 from leaguesafe_payments l where l.user_id=u.id and l.season={SEASON} and l.status='Paid') as suggested_is_paid
from un left join users u on u.id = find_user_id_for_email(un.em, {SEASON})
order by un.nm""")
sheet(wb, "Anonymous to tie", h, rows,
      note=f"Week {WEEK} entries not tied to an account, with the account the system resolves each to. A blank suggestion needs a manual tie.",
      widths={"entry_email": 32, "suggested_email": 32, "basis": 40, "submitted_at": 20})

# ------------------------------------------------------------------ 9. summary
_, counts = q(f"""select
 (select count(*) from {LSP})::text,
 (select count(*) from {LSP} and status='Paid')::text,
 (select count(*) from {LSP} and status<>'Paid')::text,
 (select count(*) from {LSP} and user_id is null)::text,
 (select sum(paid) from {LSP})::text,
 (select count(*) from season_leaderboard where season={SEASON})::text,
 (select grace_period_weeks from app_settings limit 1)::text,
 (select coalesce(max(week),0) from week_settings where season={SEASON} and games_selected)::text,
 (select count(*) from {LSP} and status='Paid'
    and user_id not in ({PLAYERS}))::text,
 (select count(*) from ({PLAYERS}) p
   where exists (select 1 from leaguesafe_payments l
                 where l.season={SEASON} and l.user_id=p.user_id and l.status='Paid'))::text,
 (select count(*) from ({PLAYERS}) p
   where not exists (select 1 from leaguesafe_payments l
                     where l.season={SEASON} and l.user_id=p.user_id and l.status='Paid'))::text""")
c = counts[0]
ws = wb.create_sheet("Summary", 0)
ws.column_dimensions["A"].width = 4
ws.column_dimensions["B"].width = 52
ws.column_dimensions["C"].width = 16
ws.column_dimensions["D"].width = 62
ws["B2"] = f"LeagueSafe reconciliation — season {SEASON}"
ws["B2"].font = Font(bold=True, size=16, color=BROWN)
ws["B3"] = "Read from the production database on 8 September 2026. Every tab is a filterable table."
ws["B3"].font = Font(italic=True, size=10, color="5C5145")

lines = [
    ("", "THE REGISTER", "", ""),
    ("1", "LeagueSafe rows on file", c[0], "Compare against today's LeagueSafe CSV — if this differs, the import is stale"),
    ("", "Paid", c[1], ""),
    ("", "Not paid", c[2], "Money outstanding — see Money issues"),
    ("", "Rows with no account linked", c[3], "Every payment maps to an account"),
    ("", "Dollars collected", c[4], ""),
    ("", "", "", ""),
    ("", "WHO IS BEING SCORED", "", ""),
    ("2", "On the season leaderboard", c[5],
     f"= {c[9]} paid with picks + {c[10]} unpaid, still inside the grace period"),
    ("3", "Paid, submitted nothing", c[8],
     f"{COUNTS['Split identities']} of these are playing under another address"),
    ("", "", "", ""),
    ("", "WHAT TO ACT ON", "", ""),
    ("4", "Split identities to merge", COUNTS["Split identities"],
     "Paid under one address, playing under another — tab: Split identities"),
    ("5", "Playing with no payment", COUNTS["Playing unpaid"],
     "After the split identities are accounted for — tab: Playing unpaid"),
    ("6", "Paid no-shows", COUNTS["Paid no picks"], "Paid, no sheet anywhere — tab: Paid no picks"),
    ("7", "Entries with money unsettled", COUNTS["Money issues"],
     "Includes the 6 unpaid; the rest are pending transfers and one overpayment — tab: Money issues"),
    ("8", f"Sheets on file for players holding more than one (week {WEEK})", COUNTS[f"Duplicate sheets W{WEEK}"],
     f"Tabs: Duplicate sheets W{WEEK}, Sheet differences"),
    ("9", f"Anonymous entries still to tie (week {WEEK})", COUNTS["Anonymous to tie"],
     "Tie them from the Anonymous picks row in Week Review — tab: Anonymous to tie"),
    ("", "", "", ""),
    ("", "GRACE PERIOD", "", ""),
    ("", "grace_period_weeks", c[6], "Unpaid players stay on the board while weeks-with-games <= this"),
    ("", "Weeks with games selected", c[7], "When this passes the grace period, unmerged split identities lose PAID players their standing"),
]
r = 5
for n, label, val, note in lines:
    if label and not val and label.isupper():
        cell = ws.cell(r, 2, label)
        cell.font = Font(bold=True, size=9, color=GOLD)
        cell.alignment = Alignment(vertical="center")
        ws.row_dimensions[r].height = 22
    elif label:
        ws.cell(r, 1, n).font = Font(size=9, color="8A7E70")
        ws.cell(r, 2, label).font = Font(size=11, color=INK)
        vc = ws.cell(r, 3, num(val))
        vc.font = Font(bold=True, size=11, color=BROWN)
        vc.alignment = Alignment(horizontal="right")
        ws.cell(r, 4, note).font = Font(size=9, color="5C5145")
        for col in (2, 3, 4):
            ws.cell(r, col).border = THIN
    r += 1
ws.sheet_view.showGridLines = False

out = os.path.join(REPO, f"leaguesafe-reconciliation-{SEASON}.xlsx")
wb.save(out)
print("wrote", out)
for s in wb.sheetnames:
    print(f"  {s}: {wb[s].max_row} rows")
