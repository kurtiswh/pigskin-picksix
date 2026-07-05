"""Shared helpers for the PP6 historic-import Stage 0 staging parser.

Stage 0 is READ-ONLY: it parses the raw archive under data/imports/historic/
into reviewable JSON. It never touches the database.
"""
import re
import unicodedata

# ---- paths -----------------------------------------------------------------
import os
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ARCHIVE_DIR = os.path.join(REPO_ROOT, "data", "imports", "historic")
STAGING_DIR = os.path.join(ARCHIVE_DIR, "_staging")


# ---- pick-string parsing ---------------------------------------------------
# A pick cell looks like: "Oklahoma -10.5", "Western Michigan +5.5",
# "TEXAS +3.5", "Brigham Young +1.0".  The team name may contain spaces and
# may be upper-cased (upper-case == the favorite in the source workbooks).
_SPREAD_RE = re.compile(r"^\s*(.+?)\s+([+-]?\d+(?:\.\d+)?)\s*$")


def parse_pick_string(cell):
    """Return (team, signed_spread) from a pick cell, or None if not a pick.

    signed_spread is from the *picked team's* perspective:
      negative => picked the favorite, positive => picked the underdog.
    """
    if cell is None:
        return None
    s = str(cell).strip()
    if not s:
        return None
    m = _SPREAD_RE.match(s)
    if not m:
        return None
    team = m.group(1).strip()
    spread = float(m.group(2))
    return team, spread


def _mag_slug(mag):
    """Spread magnitude as used in workbook slugs: 23.0->'23-0', 5.5->'5-5'."""
    whole = int(mag)
    tenth = int(round((mag - whole) * 10))
    return f"{whole}-{tenth}"


def team_slug(name):
    """Slugify a team name the way the 2019+ workbooks do: 'North Carolina'
    -> 'north-carolina', 'NC State' -> 'nc-state'."""
    s = norm_team(name)                # lower, accent-stripped, single-spaced
    s = re.sub(r"[^a-z0-9& ]", "", s)  # drop periods/punctuation but KEEP '&' (Texas A&M)
    return re.sub(r"\s+", "-", s.strip())


def game_slug(name, spread_magnitude):
    return f"{team_slug(name)}-{_mag_slug(abs(float(spread_magnitude)))}"


def norm_team(name):
    """Loose normalization for comparing team names *within* the archive.

    Canonical mapping to CFBD/DB names happens later (Stage 1) via a reviewed
    alias table; this only collapses case/whitespace/accents so the same team
    written two ways in one workbook compares equal.
    """
    if name is None:
        return ""
    s = unicodedata.normalize("NFKD", str(name))
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


# ---- identity --------------------------------------------------------------
def norm_email(*candidates):
    """First non-empty email, lower-cased and trimmed."""
    for c in candidates:
        if c and str(c).strip():
            return str(c).strip().lower()
    return ""


def _s(v):
    """Coerce a cell value to a stripped string (some name cells are ints)."""
    if v is None:
        return ""
    return str(v).strip()


def player_key(first, last, *emails):
    """Stable key for a historic player. Prefer email; fall back to name."""
    email = norm_email(*emails)
    if email:
        return email
    name = f"{_s(first)} {_s(last)}".strip().lower()
    return name or "unknown"


def full_name(first, last):
    return re.sub(r"\s+", " ", f"{_s(first)} {_s(last)}").strip()


# ---- scoring (mirrors database/schema.sql calculate_pick_results) ----------
def score_pick(picked_spread, picked_score, opp_score, is_lock):
    """Re-derive (result, points) with the CURRENT DB rules.

    picked_spread: signed from picked team's perspective (see parse_pick_string).
    Returns (result, points) where result in {"win","loss","push"}.

    NOTE: historic seasons may have used different bonus tiers; the
    reconciliation report flags where this disagrees with the workbook total.
    """
    cover_margin = picked_score - opp_score + picked_spread
    if cover_margin == 0:
        return "push", 10  # push: base 10, no bonus, lock irrelevant
    if cover_margin < 0:
        return "loss", 0
    # win
    base = 20
    if cover_margin >= 29:
        bonus = 5
    elif cover_margin >= 20:
        bonus = 3
    elif cover_margin >= 11:
        bonus = 1
    else:
        bonus = 0
    points = base + (bonus * 2 if is_lock else bonus)
    return "win", points
