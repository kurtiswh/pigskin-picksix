#!/usr/bin/env python3
"""PP6 historic-import — Stage 1 (loader).

Turns the Stage 0 staging JSON into idempotent SQL that loads individual results
into the live schema:
  - users            : lightweight non-login rows for historic-only players
  - games            : one row per (season, week, slot), workbook names verbatim
  - anonymous_picks  : each pick with authoritative result/points, linked to a
                       user (assigned_user_id) and a game (game_id)
  - leaguesafe_payments : one row per (user, season)

Design:
  * DRY-RUN by default: prints a report and writes the .sql file; touches nothing.
  * Deterministic UUIDs (uuid5) for every generated id, so re-running is fully
    idempotent (ON CONFLICT upserts, no duplicate identities/games/picks).
  * Players are matched to existing users by email / leaguesafe_email; unmatched
    players get a lightweight historic user (user_status='historic').
  * NO team normalization: favorite=home, underdog=away, workbook names as-is.

Usage:
  python3 stage1_load.py 2016 2017 ...        # dry-run: build SQL + report
  python3 stage1_load.py 2016 --apply         # build then apply via psql (txn)

2024 is NOT loaded by default (it partially exists in the DB and needs a
separate reconcile). Pass --allow-2024 to include it.
"""
import json
import os
import re
import subprocess
import sys
import uuid
from datetime import date, datetime, timedelta, timezone

from common import STAGING_DIR, norm_team

NS = uuid.UUID("d7c1e2a4-0000-4a00-9000-706967736b69")  # fixed namespace for PP6
LOAD_DIR = os.path.join(STAGING_DIR, "_load")
DEFAULT_SEASONS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023]


def det_uuid(*parts):
    return str(uuid.uuid5(NS, "|".join(str(p) for p in parts)))


def sqlstr(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def sqlnum(v):
    return "NULL" if v is None else str(v)


def sqlbool(v):
    return "TRUE" if v else "FALSE"


def synth_email(name):
    slug = re.sub(r"[^a-z0-9]+", "-", norm_team(name)).strip("-") or "unknown"
    return f"historic-{slug}@pp6.local"


def kickoff(season, week):
    """Deterministic synthetic kickoff: the week-th Saturday from Sep 1, 19:00Z."""
    d = date(season, 9, 1)
    d += timedelta(days=(5 - d.weekday()) % 7)      # first Saturday on/after Sep 1
    d += timedelta(weeks=week - 1)
    return datetime(d.year, d.month, d.day, 19, 0, tzinfo=timezone.utc).isoformat()


def load_db_email_map():
    """email(lower) -> existing users.id, from users.email and users.leaguesafe_email."""
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        print("  !! SUPABASE_DB_URL not set (source .env) — cannot match existing users")
        return {}
    q = ("SELECT lower(email), id::text FROM users WHERE email IS NOT NULL "
         "UNION SELECT lower(leaguesafe_email), id::text FROM users WHERE leaguesafe_email IS NOT NULL")
    out = subprocess.run(["psql", url, "-Atc", q], capture_output=True, text=True)
    if out.returncode != 0:
        print("  !! could not query users:", out.stderr.strip()[:200])
        return {}
    m = {}
    for line in out.stdout.splitlines():
        if "|" in line:
            email, uid = line.split("|", 1)
            if email:
                m[email] = uid
    return m


class Identity:
    """Resolves a stable identity (and user_id) for a historic player, across seasons."""
    def __init__(self, db_emails):
        self.db_emails = db_emails
        self.by_key = {}       # identity_key -> record
        self.new_users = {}    # user_id -> (email, display_name)
        self.claimed = {}      # existing user_id -> the first identity key that claimed it

    def resolve(self, name, *emails):
        emails = [e.strip().lower() for e in emails if e and str(e).strip()]
        real_email = emails[0] if emails else None
        key = real_email or "name:" + norm_team(name)
        if key in self.by_key:
            return self.by_key[key]
        # match to an existing user by any of the player's emails
        matched = next((self.db_emails[e] for e in emails if e in self.db_emails), None)
        # A real account can list two emails (email + leaguesafe_email). Don't let
        # two DISTINCT historic entries collapse into it — first come links, the
        # rest get their own historic identity so standings aren't double-counted.
        forced_split = bool(matched) and self.claimed.get(matched, key) != key
        if forced_split:
            matched = None
        email_to_use = real_email or synth_email(name)
        disp = (name or "").strip() or email_to_use   # users.display_name must be non-empty
        if matched:
            uid, is_new = matched, False
            self.claimed[matched] = key
        else:
            # For a split-off entry whose email is itself an existing users.email,
            # give the new historic user a unique email so ON CONFLICT(email) does
            # not skip it (which would leave the pick's FK dangling).
            user_email = email_to_use
            if forced_split and user_email in self.db_emails:
                user_email = f"{email_to_use}#hist"
            uid, is_new = det_uuid("user", user_email), True
            self.new_users[uid] = (user_email, disp)
        rec = {"user_id": uid, "email": email_to_use, "name": disp, "is_new": is_new}
        self.by_key[key] = rec
        return rec


def batched_insert(f, table, columns, rows, conflict, update_cols=None, batch=500):
    """Write multi-row INSERT ... ON CONFLICT statements."""
    if not rows:
        return
    collist = ", ".join(columns)
    if update_cols:
        setclause = ", ".join(f"{c}=EXCLUDED.{c}" for c in update_cols)
        tail = f"ON CONFLICT {conflict} DO UPDATE SET {setclause};"
    else:
        tail = f"ON CONFLICT {conflict} DO NOTHING;"
    for i in range(0, len(rows), batch):
        chunk = rows[i:i + batch]
        f.write(f"INSERT INTO {table} ({collist}) VALUES\n")
        f.write(",\n".join("  (" + ", ".join(r) + ")" for r in chunk))
        f.write("\n" + tail + "\n")


def process(seasons, allow_2024):
    os.makedirs(LOAD_DIR, exist_ok=True)
    db_emails = load_db_email_map()
    print(f"  existing user emails loaded: {len(db_emails)}")
    ident = Identity(db_emails)

    game_rows, pick_rows, pay_rows = [], [], []
    game_seen, pick_seen, pay_seen = set(), set(), set()
    lock_seen = set()      # (user_id, season, week) -> enforce single lock
    stats = {s: {} for s in seasons}
    skipped = {"no_game": 0, "no_result": 0, "extra_lock": 0, "no_spread": 0, "pay_unmatched": 0}

    for season in seasons:
        d = os.path.join(STAGING_DIR, str(season))
        if not os.path.isdir(d):
            print(f"  !! no staging for {season}, skipping")
            continue
        games = json.load(open(os.path.join(d, "games.json")))
        picks = json.load(open(os.path.join(d, "picks.json")))
        payments = json.load(open(os.path.join(d, "payments.json")))

        # ---- games: (season, week, slot) -> deterministic game_id -------------
        game_id_by_ws_slot = {}
        for g in games:
            home, away = g["favorite"], g["underdog"]
            if g.get("favorite_spread") is None:
                skipped["no_spread"] += 1
                continue
            gid = det_uuid("game", season, g["week"], home, away)
            game_id_by_ws_slot[(g["week"], g["slot"])] = (gid, home, away)
            ckey = (season, g["week"], home, away)
            if ckey in game_seen:
                continue
            game_seen.add(ckey)
            fs, ds, spr = g["favorite_score"], g["underdog_score"], g["favorite_spread"]
            completed = fs is not None and ds is not None
            home_cov = away_cov = winner = None
            if completed:
                margin = fs + spr - ds
                home_cov, away_cov = margin > 0, margin < 0
                winner = home if home_cov else (away if away_cov else "push")
            game_rows.append([
                sqlstr(gid), str(g["week"]), str(season), sqlstr(home), sqlstr(away),
                sqlnum(fs if completed else None), sqlnum(ds if completed else None),
                str(spr), sqlstr(kickoff(season, g["week"])),
                sqlstr("completed" if completed else "scheduled"),
                sqlstr(home), sqlbool(g.get("neutral_site")),
                sqlbool(home_cov) if home_cov is not None else "NULL",
                sqlbool(away_cov) if away_cov is not None else "NULL",
                sqlstr(winner), sqlbool(completed),
            ])

        # ---- picks -> anonymous_picks ----------------------------------------
        n_picks = n_new = n_matched = 0
        players_this = set()
        for p in picks:
            ginfo = game_id_by_ws_slot.get((p["week"], p["slot"]))
            if not ginfo:
                skipped["no_game"] += 1
                continue
            if p.get("result") is None or p.get("points_earned") is None:
                skipped["no_result"] += 1
                continue
            gid, home, away = ginfo
            # prefer form email over logged-in email (see stage0 note on shared logins)
            who = ident.resolve(p["player_name"], p.get("email_form"), p.get("email_login"))
            players_this.add(who["user_id"])
            (n_new if who["is_new"] else n_matched)  # counted below via ident
            email = who["email"]

            is_lock = bool(p["is_lock"])
            if is_lock:
                lk = (email, season, p["week"])
                if lk in lock_seen:
                    is_lock = False
                    skipped["extra_lock"] += 1
                else:
                    lock_seen.add(lk)

            pkey = (email, p["week"], season, gid)
            if pkey in pick_seen:
                continue
            pick_seen.add(pkey)
            pid = det_uuid("apick", season, p["week"], email, gid)
            sel = p["selected_team"]
            pick_rows.append([
                sqlstr(pid), sqlstr(email), sqlstr(who["name"] or email),
                str(p["week"]), str(season), sqlstr(gid),
                sqlstr(home), sqlstr(away), sqlstr(sel), sqlbool(is_lock),
                sqlstr(p["result"]), str(int(p["points_earned"])),
                sqlstr(who["user_id"]), sqlbool(True),  # show_on_leaderboard
                sqlbool(True), sqlbool(True), sqlbool(True),  # is_validated, submitted, is_active_pick_set
                sqlstr("auto_validated"), sqlstr("historic import"),
            ])
            n_picks += 1

        # ---- payments -> leaguesafe_payments ---------------------------------
        n_pay = 0
        for pay in payments:
            email = (pay.get("email") or "").strip().lower()
            uid = db_emails.get(email) or ident.by_key.get(email, {}).get("user_id")
            if not uid:
                skipped["pay_unmatched"] += 1
                continue
            if (uid, season) in pay_seen:
                continue
            pay_seen.add((uid, season))
            status = pay.get("status") or ("Paid" if str(pay.get("paid") or 0) not in ("0", "0.0", "0.0000", "") else "NotPaid")
            pay_rows.append([
                sqlstr(det_uuid("pay", season, uid)), sqlstr(uid), str(season),
                sqlstr(pay.get("owner") or ""), sqlstr(email or synth_email(pay.get("owner") or "unknown")),
                sqlnum(_num(pay.get("entry_fee"))), sqlnum(_num(pay.get("paid"))),
                sqlnum(_num(pay.get("pending"))), sqlnum(_num(pay.get("owes"))),
                sqlstr(status), sqlbool(True),
            ])
            n_pay += 1

        stats[season] = {"games": sum(1 for k in game_seen if k[0] == season),
                         "picks": n_picks, "players": len(players_this), "payments": n_pay}
        print(f"  {season}: games+={stats[season]['games']} picks={n_picks} "
              f"players={len(players_this)} payments={n_pay}")

    # ---- write SQL ----------------------------------------------------------
    # user_status check-constraint allows only {active, merged, disabled}; historic
    # imports are identified by anonymous_picks.processing_notes='historic import'.
    new_user_rows = [[sqlstr(uid), sqlstr(email), sqlstr(name or email),
                      sqlstr("active"), sqlstr("Manual Registration")]
                     for uid, (email, name) in ident.new_users.items()]
    tag = "-".join(str(s) for s in seasons)
    sql_path = os.path.join(LOAD_DIR, f"load_{tag}.sql")
    with open(sql_path, "w") as f:
        f.write("-- PP6 historic import — generated, idempotent. Wrapped in a transaction.\n")
        f.write("BEGIN;\n\n")
        f.write(f"-- {len(new_user_rows)} lightweight historic users\n")
        batched_insert(f, "public.users",
                       ["id", "email", "display_name", "user_status", "payment_status"],
                       new_user_rows, "(email)", update_cols=None)
        f.write(f"\n-- {len(game_rows)} games\n")
        batched_insert(f, "public.games",
                       ["id", "week", "season", "home_team", "away_team", "home_score",
                        "away_score", "spread", "kickoff_time", "status", "favorite_team",
                        "neutral_site", "home_covered", "away_covered",
                        "winner_against_spread", "api_completed"],
                       game_rows, "(week, season, home_team, away_team)",
                       update_cols=["home_score", "away_score", "spread", "status",
                                    "home_covered", "away_covered", "winner_against_spread",
                                    "api_completed"])
        f.write(f"\n-- {len(pick_rows)} anonymous_picks\n")
        batched_insert(f, "public.anonymous_picks",
                       ["id", "email", "name", "week", "season", "game_id", "home_team",
                        "away_team", "selected_team", "is_lock", "result", "points_earned",
                        "assigned_user_id", "show_on_leaderboard", "is_validated",
                        "submitted", "is_active_pick_set", "validation_status", "processing_notes"],
                       pick_rows, "(email, week, season, game_id)",
                       update_cols=["result", "points_earned", "is_lock", "assigned_user_id",
                                    "show_on_leaderboard", "selected_team", "home_team", "away_team"])
        f.write(f"\n-- {len(pay_rows)} leaguesafe_payments\n")
        batched_insert(f, "public.leaguesafe_payments",
                       ["id", "user_id", "season", "leaguesafe_owner_name", "leaguesafe_email",
                        "entry_fee", "paid", "pending", "owes", "status", "is_matched"],
                       pay_rows, "(user_id, season)",
                       update_cols=["leaguesafe_owner_name", "leaguesafe_email", "entry_fee",
                                    "paid", "pending", "owes", "status", "is_matched"])
        f.write("\nCOMMIT;\n")

    matched_players = sum(1 for r in ident.by_key.values() if not r["is_new"])
    print("\n  === DRY-RUN SUMMARY ===")
    print(f"  distinct players: {len(ident.by_key)} "
          f"(matched existing users: {matched_players}, new historic users: {len(ident.new_users)})")
    print(f"  games: {len(game_rows)} | anonymous_picks: {len(pick_rows)} | payments: {len(pay_rows)}")
    print(f"  skipped/adjusted: {skipped}")
    print(f"  SQL written to: {sql_path}  ({os.path.getsize(sql_path)//1024} KB)")
    return sql_path


def _num(v):
    try:
        return float(str(v).replace(",", "")) if v not in (None, "") else None
    except (ValueError, TypeError):
        return None


def main():
    args = sys.argv[1:]
    apply = "--apply" in args
    allow_2024 = "--allow-2024" in args
    seasons = [int(a) for a in args if a.isdigit()] or list(DEFAULT_SEASONS)
    if 2024 in seasons and not allow_2024:
        print("  ! 2024 excluded (partially in DB; needs reconcile). Use --allow-2024 to force.")
        seasons = [s for s in seasons if s != 2024]
    print(f"=== Stage 1 load — seasons {seasons} ===")
    sql_path = process(seasons, allow_2024)
    if apply:
        url = os.environ.get("SUPABASE_DB_URL")
        if not url:
            print("  !! SUPABASE_DB_URL not set; cannot apply."); return
        print("\n  APPLYING via psql (single transaction)...")
        r = subprocess.run(["psql", url, "-v", "ON_ERROR_STOP=1", "-1", "-f", sql_path],
                           capture_output=True, text=True)
        print(r.stdout[-2000:])
        if r.returncode != 0:
            print("  !! APPLY FAILED:\n", r.stderr[-3000:])
        else:
            print("  ✅ applied successfully.")
    else:
        print("\n  (dry-run only — no DB writes. Re-run with --apply to load.)")


if __name__ == "__main__":
    main()
