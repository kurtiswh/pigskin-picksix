-- Migration 160: single deterministic anonymous-pick auto-tie (Part B / B3)
--
-- Replaces the several scattered "assign anonymous pick to a user" paths with
-- one rule, applied in two places that share the SAME matcher:
--   1. At submission — a BEFORE INSERT trigger ties the entry automatically, so
--      a paid, email-matching entrant appears on the leaderboard with no admin
--      action.
--   2. On demand — an RPC the Week Review screen calls to tie any remaining
--      unassigned entries for a week (idempotent, safe to re-run).
--
-- Tie rule:
--   match email (case-insensitive) against users.email, users.leaguesafe_email,
--   or leaguesafe_payments.leaguesafe_email (for the season). On a match set
--   assigned_user_id + validation_status='auto-validated' + show_on_leaderboard
--   = true (the leaderboard view still gates final visibility by payment status,
--   with the grace period relaxing that for early weeks — so we set show=true on
--   ANY match and let the view decide). No match => left unassigned & hidden for
--   admin review.
--
-- Safety: only ever fills in a tie when assigned_user_id IS NULL; never changes
-- an already-assigned entry. Reads no pick results, changes no scoring.

-- ── 1. Shared matcher ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.find_user_id_for_email(p_email text, p_season integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RETURN NULL;
  END IF;

  -- 1) users.email / users.leaguesafe_email
  SELECT id INTO v_user_id
  FROM public.users
  WHERE lower(email) = lower(p_email)
     OR lower(leaguesafe_email) = lower(p_email)
  LIMIT 1;

  -- 2) fallback: leaguesafe_payments for this season
  IF v_user_id IS NULL THEN
    SELECT user_id INTO v_user_id
    FROM public.leaguesafe_payments
    WHERE season = p_season
      AND lower(leaguesafe_email) = lower(p_email)
    LIMIT 1;
  END IF;

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_user_id_for_email(text, integer) TO authenticated, anon;

-- ── 2. At-submission trigger ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_tie_anonymous_pick()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NEW.assigned_user_id IS NULL THEN
    v_user_id := public.find_user_id_for_email(NEW.email, NEW.season);

    IF v_user_id IS NOT NULL THEN
      NEW.assigned_user_id := v_user_id;
      NEW.validation_status := 'auto-validated';
      NEW.show_on_leaderboard := TRUE;  -- view + grace period still gate by payment
    ELSE
      NEW.validation_status := COALESCE(NEW.validation_status, 'pending');
      NEW.show_on_leaderboard := COALESCE(NEW.show_on_leaderboard, FALSE);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_tie_anonymous_pick ON public.anonymous_picks;
CREATE TRIGGER trg_auto_tie_anonymous_pick
  BEFORE INSERT ON public.anonymous_picks
  FOR EACH ROW EXECUTE FUNCTION public.auto_tie_anonymous_pick();

-- ── 3. On-demand re-tie (Week Review) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_tie_anonymous_picks(p_week integer, p_season integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tied integer := 0;
BEGIN
  WITH matched AS (
    SELECT ap.id,
           public.find_user_id_for_email(ap.email, ap.season) AS user_id
    FROM public.anonymous_picks ap
    WHERE ap.season = p_season
      AND ap.week = p_week
      AND ap.assigned_user_id IS NULL
  ),
  updated AS (
    UPDATE public.anonymous_picks ap
    SET assigned_user_id = m.user_id,
        validation_status = 'auto-validated',
        show_on_leaderboard = TRUE
    FROM matched m
    WHERE ap.id = m.id
      AND m.user_id IS NOT NULL
    RETURNING ap.id
  )
  SELECT count(*) INTO v_tied FROM updated;

  RETURN v_tied;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_tie_anonymous_picks(integer, integer) TO authenticated;
