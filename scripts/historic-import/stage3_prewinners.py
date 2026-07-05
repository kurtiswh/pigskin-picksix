#!/usr/bin/env python3
"""PP6 historic-import — Stage 3 (pre-2016 Hall of Champions).

Pre-2016 seasons have no per-pick data — only Final Leaderboard PDFs. This
parses those PDFs (pdftotext -layout) into final standings and populates
season_winners: champion + top-10 point places, lock winner/second (by lock
record), and weekly winners (max points per week column). Players become
name-based historic users (synthetic emails), per the chosen identity policy.

Dry-run by default; --apply runs via psql. Idempotent.

Usage:
  python3 stage3_prewinners.py [2006 2007 ...] [--apply]
"""
import glob
import os
import re
import subprocess
import sys
import uuid

from common import norm_team

NS = uuid.UUID("d7c1e2a4-0000-4a00-9000-706967736b69")  # same namespace as stage1
HIST = os.path.join(os.path.dirname(__file__), "..", "..", "data", "imports", "historic")
ARCHIVE = os.path.join(HIST, "Historical")
MASTER_STATS = os.path.join(HIST, "Historic Stats - thru 2016.xlsx")
LOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..",
                        "data", "imports", "historic", "_staging", "_load")
DEFAULT_SEASONS = list(range(2006, 2016))

# rank [PRV] NAME  W-L-T (record)  W-L-T (lock)  <weekly nums...> TOTAL
ROW_RE = re.compile(
    r"^\s*(\d+)\s+(.*?)\s+(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\s+"
    r"(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\s+(.+?)\s*$")


def det_uuid(*parts):
    return str(uuid.uuid5(NS, "|".join(str(p) for p in parts)))


def sqlstr(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def synth_email(name):
    slug = re.sub(r"[^a-z0-9]+", "-", norm_team(name)).strip("-") or "unknown"
    return f"historic-{slug}@pp6.local"


def _nn(name):
    return re.sub(r"\s+", " ", str(name or "").strip().lower())


def load_master_emails():
    """Name(normalized) -> real email, from Historic Stats 'Master List'."""
    import openpyxl
    m = {}
    if not os.path.exists(MASTER_STATS):
        return m
    wb = openpyxl.load_workbook(MASTER_STATS, read_only=True, data_only=True)
    for r in wb["Master List"].iter_rows(values_only=True):
        email = r[3] if len(r) > 3 else None
        if not (isinstance(email, str) and "@" in email):
            continue
        for nm in (r[0], r[5] if len(r) > 5 else None):
            if nm:
                m[_nn(nm)] = email.strip().lower()
    wb.close()
    return m


def load_db_email_map():
    """email(lower) -> existing users.id (users.email + leaguesafe_email)."""
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        return {}
    q = ("SELECT lower(email), id::text FROM users WHERE email IS NOT NULL "
         "UNION SELECT lower(leaguesafe_email), id::text FROM users WHERE leaguesafe_email IS NOT NULL")
    out = subprocess.run(["psql", url, "-Atc", q], capture_output=True, text=True)
    m = {}
    for line in out.stdout.splitlines():
        if "|" in line:
            e, uid = line.split("|", 1)
            if e:
                m[e] = uid
    return m


def find_pdf(season):
    pats = [
        os.path.join(ARCHIVE, f"{season}-final-leaderboard.pdf"),
        os.path.join(ARCHIVE, str(season), "*inal*eaderboard*.pdf"),
        os.path.join(ARCHIVE, f"*{season}*inal*eaderboard*.pdf"),
    ]
    for p in pats:
        hits = glob.glob(p)
        if hits:
            return hits[0]
    return None


def parse_pdf(path, season):
    """Return list of standings dicts: rank, name, lock_wins/losses, weekly[]."""
    txt = subprocess.run(["pdftotext", "-layout", path, "-"],
                         capture_output=True, text=True).stdout
    standings = []
    for line in txt.splitlines():
        m = ROW_RE.match(line)
        if not m:
            continue
        rank = int(m.group(1))
        name = re.sub(r"^\d+\s+", "", m.group(2)).strip()  # strip leading PRV if present
        if not name or not re.search(r"[A-Za-z]", name):
            continue
        wins, losses, pushes = int(m.group(3)), int(m.group(4)), int(m.group(5))
        lock_w, lock_l = int(m.group(6)), int(m.group(7))
        nums = re.findall(r"\d+", m.group(9))
        weekly = [int(n) for n in nums[:-1]] if len(nums) >= 1 else []
        total = int(nums[-1]) if nums else 0
        standings.append({
            "rank": rank, "name": name,
            "wins": wins, "losses": losses, "pushes": pushes,
            "lock_wins": lock_w, "lock_losses": lock_l,
            "weekly": weekly, "total": total,
        })
    # rank can repeat/skip (ties); keep source order, dedupe exact name dupes
    seen, out = set(), []
    for s in standings:
        if s["name"].lower() in seen:
            continue
        seen.add(s["name"].lower())
        out.append(s)
    return out


def process(season, ctx, sql_parts):
    path = find_pdf(season)
    if not path:
        print(f"  {season}: no Final Leaderboard PDF found")
        return None
    standings = parse_pdf(path, season)
    if not standings:
        print(f"  {season}: parsed 0 rows from {os.path.basename(path)}")
        return None

    users, master, db_emails = ctx["users"], ctx["master"], ctx["db_emails"]
    resolved, claimed = ctx["resolved"], ctx["claimed"]

    def uid_for(name):
        key = _nn(name)
        if key in resolved:
            return resolved[key]
        # tie to a real person via the Master List email; else name-based synthetic
        email = master.get(key) or synth_email(name)
        existing = db_emails.get(email)
        if existing and claimed.get(existing, key) != key:
            existing = None                       # already claimed by another entry
        if existing:
            uid = existing
            claimed[existing] = key
        else:
            user_email = email
            if user_email in db_emails:            # would collide with a real users.email
                user_email = f"{email}#hist"
            uid = det_uuid("user", user_email)
            users[uid] = (user_email, name)
        resolved[key] = uid
        return uid

    # order by rank for point places
    by_rank = sorted(standings, key=lambda s: s["rank"])
    point_ids = [uid_for(s["name"]) for s in by_rank[:10]]
    point_ids += [None] * (10 - len(point_ids))

    # lock winner/second by lock wins (tiebreak fewer losses)
    by_lock = sorted(standings, key=lambda s: (-s["lock_wins"], s["lock_losses"]))
    lock_ids = [uid_for(s["name"]) for s in by_lock[:2]]
    lock_ids += [None] * (2 - len(lock_ids))

    # weekly winners: max points in each week column
    n_weeks = max((len(s["weekly"]) for s in standings), default=0)
    weekly_json = []
    for wi in range(n_weeks):
        best, best_name = -1, None
        for s in standings:
            if wi < len(s["weekly"]) and s["weekly"][wi] > best:
                best, best_name = s["weekly"][wi], s["name"]
        if best_name:
            weekly_json.append({"week": wi + 1, "user_id": uid_for(best_name)})

    cols = [
        ("point_winner_user_id", point_ids[0]), ("point_second_user_id", point_ids[1]),
        ("point_third_user_id", point_ids[2]), ("point_fourth_user_id", point_ids[3]),
        ("point_fifth_user_id", point_ids[4]), ("point_sixth_user_id", point_ids[5]),
        ("point_seventh_user_id", point_ids[6]), ("point_eighth_user_id", point_ids[7]),
        ("point_ninth_user_id", point_ids[8]), ("point_tenth_user_id", point_ids[9]),
        ("lock_winner_user_id", lock_ids[0]), ("lock_second_user_id", lock_ids[1]),
    ]
    import json as _json
    weekly_sql = sqlstr(_json.dumps(weekly_json)) + "::jsonb"
    setclause = ", ".join(f"{c}={sqlstr(v)}" for c, v in cols)
    sql_parts.append(f"SELECT public.get_or_create_season_winners({season});")
    sql_parts.append(
        f"UPDATE public.season_winners SET {setclause}, "
        f"weekly_winners={weekly_sql}, is_finalized=TRUE, updated_at=now() "
        f"WHERE season={season};")
    print(f"  {season}: {len(standings)} players, champion={by_rank[0]['name']!r}, "
          f"{len(weekly_json)} weekly winners  [{os.path.basename(path)}]")
    return len(standings)


def main():
    args = sys.argv[1:]
    apply = "--apply" in args
    seasons = [int(a) for a in args if a.isdigit()] or list(DEFAULT_SEASONS)
    ctx = {"users": {}, "master": load_master_emails(), "db_emails": load_db_email_map(),
           "resolved": {}, "claimed": {}}
    users, sql_parts = ctx["users"], []
    print(f"=== Stage 3 pre-2016 winners — seasons {seasons} ===")
    print(f"  Master List emails: {len(ctx['master'])} | existing DB emails: {len(ctx['db_emails'])}")
    for s in seasons:
        process(s, ctx, sql_parts)

    user_rows = ",\n".join(
        f"  ({sqlstr(u)}, {sqlstr(email)}, {sqlstr(name)}, 'active', 'Manual Registration')"
        for u, (email, name) in users.items())
    sql = "BEGIN;\n"
    if user_rows:
        sql += ("INSERT INTO public.users (id, email, display_name, user_status, payment_status) VALUES\n"
                + user_rows + "\nON CONFLICT (email) DO NOTHING;\n\n")
    sql += "\n".join(sql_parts) + "\nCOMMIT;\n"

    os.makedirs(LOAD_DIR, exist_ok=True)
    path = os.path.join(LOAD_DIR, "prewinners_2006-2015.sql")
    with open(path, "w") as f:
        f.write(sql)
    print(f"\n  {len(users)} name-based users; SQL -> {path}")
    if not apply:
        print("  (dry-run — no DB writes. Re-run with --apply.)")
        return
    url = os.environ.get("SUPABASE_DB_URL")
    r = subprocess.run(["psql", url, "-v", "ON_ERROR_STOP=1", "-1", "-f", path],
                       capture_output=True, text=True)
    print(r.stdout[-800:])
    print("  ✅ applied." if r.returncode == 0 else "  !! FAILED:\n" + r.stderr[-2000:])


if __name__ == "__main__":
    main()
