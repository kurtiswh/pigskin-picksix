-- Migration 180: Database size reduction + recurring maintenance
-- Context: Supabase free-plan DB hit 528 MB / 500 MB cap (113%). This migration
-- documents the one-off reclaim performed 2026-07-06 and installs a recurring
-- cleanup so it does not creep back. Result: 528 MB -> 236 MB.
--
-- NOTE: The one-off DELETE / DROP INDEX / VACUUM FULL statements below were run
-- directly against production. They are recorded here (idempotent) for history.

-- ---------------------------------------------------------------------------
-- 1. Purge disposable email_jobs (queue/log). Cancelled rows are throwaway.
--    43,235 cancelled rows removed. Sent history retained.
-- ---------------------------------------------------------------------------
DELETE FROM email_jobs WHERE status = 'cancelled';

-- ---------------------------------------------------------------------------
-- 2. Purge pg_cron run history (>7 days).
-- ---------------------------------------------------------------------------
DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';

-- ---------------------------------------------------------------------------
-- 3. Drop obsolete pre-migration-159 backup snapshots (~6 MB).
-- ---------------------------------------------------------------------------
DROP SCHEMA IF EXISTS backups CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Drop unused indexes on anonymous_picks (~50 MB of index bloat).
--    All had 0-3 lifetime scans and are non-unique / not constraint-backing.
--    KEPT: unique_anonymous_pick_per_game_user, one_lock_per_user_week (unique),
--    the pkey, and all indexes with real usage. Do NOT re-add these without a
--    demonstrated query need.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_anonymous_picks_conflict_detection;
DROP INDEX IF EXISTS idx_anonymous_picks_email_week_season;
DROP INDEX IF EXISTS idx_anonymous_picks_points_earned;
DROP INDEX IF EXISTS idx_anonymous_picks_is_validated;
DROP INDEX IF EXISTS idx_anonymous_picks_is_active;
DROP INDEX IF EXISTS idx_anonymous_picks_assigned_status;
DROP INDEX IF EXISTS idx_anonymous_picks_submitted_at;
DROP INDEX IF EXISTS idx_anonymous_picks_active_priority;

-- ---------------------------------------------------------------------------
-- 5. Reclaim dead-tuple bloat to disk. VACUUM FULL takes ACCESS EXCLUSIVE locks;
--    run only during off-season / low traffic. Cannot run inside a txn block, so
--    execute these manually if re-applying:
--      VACUUM FULL picks;
--      VACUUM FULL anonymous_picks;
--      VACUUM FULL auth.audit_log_entries;
--      VACUUM FULL auth.refresh_tokens;
--      VACUUM FULL auth.sessions;

-- ---------------------------------------------------------------------------
-- 6. Recurring maintenance: weekly cleanup (Mondays 08:00 UTC).
-- ---------------------------------------------------------------------------
SELECT cron.unschedule('db-maintenance-cleanup')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'db-maintenance-cleanup');

SELECT cron.schedule('db-maintenance-cleanup', '0 8 * * 1', $$
  DELETE FROM email_jobs WHERE status = 'cancelled';
  DELETE FROM email_jobs WHERE status = 'sent' AND created_at < now() - interval '180 days';
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
$$);
