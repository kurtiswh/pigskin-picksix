-- Migration 214: auto_tie_anonymous_pick writes values its own CHECK rejects
--
-- anonymous_picks_validation_status_check allows exactly:
--   pending_validation | auto_validated | manually_validated | duplicate_conflict
--
-- The BEFORE INSERT trigger auto_tie_anonymous_pick wrote 'auto-validated'
-- (hyphen, not underscore) whenever it matched the submitted email to an
-- account, so the row it built could never satisfy the constraint. Every such
-- insert failed with 23514:
--
--   new row for relation "anonymous_picks" violates check constraint
--   "anonymous_picks_validation_status_check"
--
-- This is the common case, not an edge case: matching a returning player's
-- email to their account is the entire point of the auto-tie. Anonymous
-- submission worked only for an email the system had never seen.
--
-- The ELSE branch's 'pending' is equally illegal but never fired: the column
-- DEFAULT 'pending_validation' is applied before a BEFORE INSERT trigger sees
-- NEW, so COALESCE(NEW.validation_status, 'pending') always returned the
-- default and the literal was dead. Corrected anyway rather than left as a
-- trap for whoever next makes that column nullable-without-default.
--
-- No data repair is needed: the constraint blocked every bad row, so none exist.

CREATE OR REPLACE FUNCTION public.auto_tie_anonymous_pick()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  IF NEW.assigned_user_id IS NULL THEN
    v_user_id := public.find_user_id_for_email(NEW.email, NEW.season);

    IF v_user_id IS NOT NULL THEN
      NEW.assigned_user_id := v_user_id;
      NEW.validation_status := 'auto_validated';
      NEW.show_on_leaderboard := TRUE;  -- view + grace period still gate by payment
    ELSE
      NEW.validation_status := COALESCE(NEW.validation_status, 'pending_validation');
      NEW.show_on_leaderboard := COALESCE(NEW.show_on_leaderboard, FALSE);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
