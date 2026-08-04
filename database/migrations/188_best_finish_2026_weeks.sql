-- Migration 188: Best Finish weeks for the 13-week 2026 season
--
-- WHY: 2026 runs 13 weeks (Sept 5 – Nov 28), not 14. Best Finish is "the final
-- four weeks", which for 2026 means weeks 10-13 — migration 143 hard-coded
-- weeks 11-14, which was right for 2025 only.
--
-- Eligibility stays data-driven (week_settings.best_finish_eligible, editable
-- in Admin → Best Finish Config); this just sets the correct default. If the
-- 2026 week_settings rows don't exist yet, both statements are no-ops and the
-- admin screen can set them once the weeks are created.

UPDATE public.week_settings
SET best_finish_eligible = TRUE
WHERE season = 2026
  AND week BETWEEN 10 AND 13;

-- Belt and braces: make sure no earlier week is left flagged for 2026.
UPDATE public.week_settings
SET best_finish_eligible = FALSE
WHERE season = 2026
  AND week NOT BETWEEN 10 AND 13
  AND best_finish_eligible;

COMMENT ON COLUMN public.week_settings.best_finish_eligible IS
  'TRUE for the final four weeks of the season, which count toward the Best Finish championship (2025: weeks 11-14; 2026: weeks 10-13).';

DO $$
DECLARE
  flagged INT;
BEGIN
  SELECT COUNT(*) INTO flagged
  FROM public.week_settings
  WHERE season = 2026 AND best_finish_eligible;
  RAISE NOTICE '✅ Migration 188: % 2026 week(s) flagged for Best Finish (expect 4 once weeks exist)', flagged;
END;
$$;
