#!/usr/bin/env python3
"""PP6 historic-import — Stage 2 (season winners).

Populates public.season_winners for historic seasons from the (now loaded &
corrected) leaderboard data — mirroring WinnersService.calculateAndUpdateWinners
+ updateWeeklyWinners:
  - point winners 1st-10th  : season_leaderboard by rank
  - lock winner / second     : by lock points (win=1, push=0.5)
  - best finish              : best_finish_leaderboard rank 1
  - weekly winners           : weekly_leaderboard weekly_rank=1 per week
Bracket winners are intentionally left blank (PDF-only; entered manually).

Dry-run by default; --apply runs via psql. Idempotent (re-updates the row).

Usage:
  python3 stage2_winners.py 2016 2017 ... [--apply]
"""
import os
import subprocess
import sys

DEFAULT_SEASONS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023]

# Per-season block: ensure the row exists, then update every derived winner.
SEASON_SQL = """
SELECT public.get_or_create_season_winners({s});
WITH ranked AS (
  SELECT user_id, row_number() OVER (ORDER BY season_rank, total_points DESC) AS rn
  FROM public.season_leaderboard WHERE season = {s}
), locks AS (
  SELECT user_id,
         row_number() OVER (
           ORDER BY (COALESCE(lock_wins,0) + COALESCE(lock_pushes,0) * 0.5) DESC,
                    COALESCE(lock_losses,0) ASC) AS rn
  FROM public.season_leaderboard WHERE season = {s}
), bf AS (
  SELECT user_id FROM public.best_finish_leaderboard
  WHERE season = {s} ORDER BY rank LIMIT 1
), wk AS (
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('week', week, 'user_id', user_id) ORDER BY week),
    '[]'::jsonb) AS j
  FROM public.weekly_leaderboard WHERE season = {s} AND weekly_rank = 1
)
UPDATE public.season_winners sw SET
  point_winner_user_id  = (SELECT user_id FROM ranked WHERE rn = 1),
  point_second_user_id  = (SELECT user_id FROM ranked WHERE rn = 2),
  point_third_user_id   = (SELECT user_id FROM ranked WHERE rn = 3),
  point_fourth_user_id  = (SELECT user_id FROM ranked WHERE rn = 4),
  point_fifth_user_id   = (SELECT user_id FROM ranked WHERE rn = 5),
  point_sixth_user_id   = (SELECT user_id FROM ranked WHERE rn = 6),
  point_seventh_user_id = (SELECT user_id FROM ranked WHERE rn = 7),
  point_eighth_user_id  = (SELECT user_id FROM ranked WHERE rn = 8),
  point_ninth_user_id   = (SELECT user_id FROM ranked WHERE rn = 9),
  point_tenth_user_id   = (SELECT user_id FROM ranked WHERE rn = 10),
  lock_winner_user_id   = (SELECT user_id FROM locks WHERE rn = 1),
  lock_second_user_id   = (SELECT user_id FROM locks WHERE rn = 2),
  best_finish_user_id   = (SELECT user_id FROM bf),
  weekly_winners        = (SELECT j FROM wk),
  is_finalized          = TRUE,
  updated_at            = now()
WHERE sw.season = {s};
"""


def build_sql(seasons):
    body = "BEGIN;\n" + "".join(SEASON_SQL.format(s=s) for s in seasons) + "\nCOMMIT;\n"
    return body


def main():
    args = sys.argv[1:]
    apply = "--apply" in args
    seasons = [int(a) for a in args if a.isdigit()] or list(DEFAULT_SEASONS)
    sql = build_sql(seasons)
    out_dir = os.path.join(os.path.dirname(__file__), "..", "..",
                           "data", "imports", "historic", "_staging", "_load")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"winners_{'-'.join(map(str, seasons))}.sql")
    with open(path, "w") as f:
        f.write(sql)
    print(f"=== Stage 2 winners — seasons {seasons} ===")
    print(f"  SQL written to {path}")
    if not apply:
        print("  (dry-run — no DB writes. Re-run with --apply.)")
        return
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        print("  !! SUPABASE_DB_URL not set."); return
    r = subprocess.run(["psql", url, "-v", "ON_ERROR_STOP=1", "-1", "-f", path],
                       capture_output=True, text=True)
    print(r.stdout[-1500:])
    if r.returncode != 0:
        print("  !! FAILED:\n", r.stderr[-2000:])
    else:
        print("  ✅ winners populated.")


if __name__ == "__main__":
    main()
