-- Migration 187: record point places 11-15 in season_winners
--
-- WHY: the 2026 official rules pay fifteen point places (27 / 17.5 / 12 / 8.5 /
-- 6.5 / 5 / 4 / 3 / 2.25 / 1.75 / 1.5 / 1.25 / 1 / 0.75 / 0.5 %). season_winners
-- only had columns through 10th, so places 11-15 had nowhere to live and the
-- winners screen could not show or finalize them.
--
-- Seasons before 2026 keep paying ten places (see PAYOUT_LEGACY in
-- src/types/winners.ts); their new columns simply stay NULL.

ALTER TABLE public.season_winners
  ADD COLUMN IF NOT EXISTS point_eleventh_user_id   UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS point_twelfth_user_id    UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS point_thirteenth_user_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS point_fourteenth_user_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS point_fifteenth_user_id  UUID REFERENCES public.users(id);

COMMENT ON COLUMN public.season_winners.point_eleventh_user_id IS
  'Point place 11 — paid from the 2026 season on (NULL for earlier seasons).';
COMMENT ON COLUMN public.season_winners.point_fifteenth_user_id IS
  'Point place 15 — paid from the 2026 season on (NULL for earlier seasons).';

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 187: season_winners now records point places 11-15';
END;
$$;
