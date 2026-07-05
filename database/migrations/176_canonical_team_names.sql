-- 176: Canonicalize team names so historical records tie to modern (2025) ones.
--
-- Historical import (<=2024) stored full school names with inconsistent casing
-- (e.g. "Brigham Young", "BRIGHAM YOUNG", "Louisiana State", "Southern California",
-- "Texas Christian", "Central Florida", "Southern Methodist", "Mississippi",
-- "Texas AM", "Louisiana Lafayette", "Hawaii"). The 2025 season (from CFBD) uses
-- the modern names/abbreviations (BYU, LSU, USC, TCU, UCF, SMU, Ole Miss,
-- Texas A&M, Louisiana, Hawai'i). That split each team's all-time ATS record.
--
-- canonical_team() maps every known variant to the modern name and properly-cases
-- abbreviations (UCLA/UNLV/UTEP/UTSA/NC State) that a naive initcap would mangle.

CREATE OR REPLACE FUNCTION public.canonical_team(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN t IS NULL THEN NULL
    ELSE CASE lower(btrim(t))
      WHEN 'brigham young'       THEN 'BYU'
      WHEN 'byu'                 THEN 'BYU'
      WHEN 'louisiana state'     THEN 'LSU'
      WHEN 'lsu'                 THEN 'LSU'
      WHEN 'mississippi'         THEN 'Ole Miss'
      WHEN 'ole miss'            THEN 'Ole Miss'
      WHEN 'southern california' THEN 'USC'
      WHEN 'usc'                 THEN 'USC'
      WHEN 'southern methodist'  THEN 'SMU'
      WHEN 'smu'                 THEN 'SMU'
      WHEN 'texas christian'     THEN 'TCU'
      WHEN 'tcu'                 THEN 'TCU'
      WHEN 'central florida'     THEN 'UCF'
      WHEN 'ucf'                 THEN 'UCF'
      WHEN 'texas am'            THEN 'Texas A&M'
      WHEN 'texas a&m'           THEN 'Texas A&M'
      WHEN 'louisiana lafayette' THEN 'Louisiana'
      WHEN 'louisiana'           THEN 'Louisiana'
      WHEN 'hawaii'              THEN 'Hawai''i'
      WHEN 'hawai''i'            THEN 'Hawai''i'
      WHEN 'miami oh'            THEN 'Miami (OH)'
      WHEN 'ucla'                THEN 'UCLA'
      WHEN 'unlv'                THEN 'UNLV'
      WHEN 'utep'                THEN 'UTEP'
      WHEN 'utsa'                THEN 'UTSA'
      WHEN 'nc state'            THEN 'NC State'
      ELSE initcap(lower(btrim(t)))
    END
  END
$$;

GRANT EXECUTE ON FUNCTION public.canonical_team(text) TO anon, authenticated;

-- Normalize stored historical records (<=2024). 2025 is already canonical, so we
-- leave the live season untouched to avoid any risk to current pick/game matching.
UPDATE public.games
   SET home_team = public.canonical_team(home_team),
       away_team = public.canonical_team(away_team)
 WHERE season <= 2024
   AND (home_team <> public.canonical_team(home_team)
     OR away_team <> public.canonical_team(away_team));

UPDATE public.picks
   SET selected_team = public.canonical_team(selected_team)
 WHERE season <= 2024
   AND selected_team <> public.canonical_team(selected_team);

UPDATE public.anonymous_picks
   SET selected_team = public.canonical_team(selected_team)
 WHERE season <= 2024
   AND selected_team <> public.canonical_team(selected_team);

-- Route the ATS analytics view through canonical_team so all years tie together
-- and abbreviations display correctly (BYU, not Byu).
CREATE OR REPLACE VIEW public.stat_team_ats AS
  SELECT public.canonical_team(selected_team) AS team,
     count(*) AS times_picked,
     count(*) FILTER (WHERE result = 'win'::pick_result) AS wins,
     count(*) FILTER (WHERE result = 'loss'::pick_result) AS losses,
     count(*) FILTER (WHERE result = 'push'::pick_result) AS pushes,
     round((count(*) FILTER (WHERE result = 'win'::pick_result))::numeric
       / NULLIF(count(*) FILTER (WHERE result = ANY (ARRAY['win'::pick_result,'loss'::pick_result])), 0)::numeric, 4) AS win_pct
    FROM anonymous_picks ap
   WHERE selected_team IS NOT NULL
     AND result IS NOT NULL
     AND season >= 2016 AND season <= 2024
   GROUP BY public.canonical_team(selected_team);
