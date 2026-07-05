#!/usr/bin/env python3
"""PP6 historic-import — Stage 4 (full pre-2016 standings).

Parses the FULL Final Leaderboard PDFs (2006-2015) into per-player season
finishes and loads them into public.historical_season_standings, so all-time
career stats can span every season (2016+ standings come live from
season_leaderboard). Reuses stage3's identity resolution (Master List emails →
existing users, else email/name-based historic users).

Dry-run by default; --apply runs via psql. Idempotent.
"""
import os
import subprocess
import sys

from stage3_prewinners import (
    load_master_emails, load_db_email_map, det_uuid, synth_email, _nn,
    parse_pdf, find_pdf, sqlstr,
)

DEFAULT_SEASONS = list(range(2006, 2016))
LOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..",
                        "data", "imports", "historic", "_staging", "_load")


def make_resolver(master, db_emails, users):
    resolved, claimed = {}, {}

    def uid_for(name):
        key = _nn(name)
        if key in resolved:
            return resolved[key]
        email = master.get(key) or synth_email(name)
        existing = db_emails.get(email)
        if existing and claimed.get(existing, key) != key:
            existing = None
        if existing:
            uid = existing
            claimed[existing] = key
        else:
            user_email = email
            if user_email in db_emails:
                user_email = f"{email}#hist"
            uid = det_uuid("user", user_email)
            users[uid] = (user_email, name)
        resolved[key] = uid
        return uid

    return uid_for


def main():
    args = sys.argv[1:]
    apply = "--apply" in args
    seasons = [int(a) for a in args if a.isdigit()] or list(DEFAULT_SEASONS)
    users = {}
    resolve = make_resolver(load_master_emails(), load_db_email_map(), users)

    standings_rows = []
    print(f"=== Stage 4 pre-2016 standings — seasons {seasons} ===")
    for season in seasons:
        path = find_pdf(season)
        if not path:
            print(f"  {season}: no PDF"); continue
        st = parse_pdf(path, season)
        for s in sorted(st, key=lambda x: x["rank"]):
            uid = resolve(s["name"])
            standings_rows.append([
                str(season), sqlstr(uid), sqlstr(s["name"]), str(s["rank"]),
                str(s["total"]), str(s.get("wins", 0)), str(s.get("losses", 0)),
                str(s.get("pushes", 0)), str(s["lock_wins"]), str(s["lock_losses"]),
            ])
        print(f"  {season}: {len(st)} players")

    user_rows = ",\n".join(
        f"  ({sqlstr(u)}, {sqlstr(email)}, {sqlstr(name)}, 'active', 'Manual Registration')"
        for u, (email, name) in users.items())
    sql = "BEGIN;\n"
    if user_rows:
        sql += ("INSERT INTO public.users (id, email, display_name, user_status, payment_status) VALUES\n"
                + user_rows + "\nON CONFLICT (email) DO NOTHING;\n\n")
    # ordered by rank already; keep the best-ranked row if two names map to one user
    for i in range(0, len(standings_rows), 500):
        chunk = standings_rows[i:i + 500]
        sql += ("INSERT INTO public.historical_season_standings "
                "(season, user_id, display_name, final_rank, total_points, wins, losses, pushes, lock_wins, lock_losses) VALUES\n"
                + ",\n".join("  (" + ", ".join(r) + ")" for r in chunk)
                + "\nON CONFLICT (season, user_id) DO NOTHING;\n")
    sql += "COMMIT;\n"

    os.makedirs(LOAD_DIR, exist_ok=True)
    path = os.path.join(LOAD_DIR, "standings_2006-2015.sql")
    with open(path, "w") as f:
        f.write(sql)
    print(f"\n  {len(standings_rows)} standings rows, {len(users)} new users -> {path}")
    if not apply:
        print("  (dry-run — no DB writes. Re-run with --apply.)")
        return
    url = os.environ.get("SUPABASE_DB_URL")
    r = subprocess.run(["psql", url, "-v", "ON_ERROR_STOP=1", "-1", "-f", path],
                       capture_output=True, text=True)
    print(r.stdout[-600:])
    print("  ✅ applied." if r.returncode == 0 else "  !! FAILED:\n" + r.stderr[-2000:])


if __name__ == "__main__":
    main()
