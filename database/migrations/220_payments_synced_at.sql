-- Migration 220: record when the LeagueSafe register was DOWNLOADED
--
-- The payment watermark shown to players ("no payment recorded as of ...").
-- Deliberately the register's download moment, not the upload moment: the
-- commissioner exports the CSV from LeagueSafe and uploads it later, and any
-- payment made in between is not in the file. Set by the CSV importer, which
-- asks for the export time as a required field.

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS payments_synced_at timestamptz;

COMMENT ON COLUMN public.app_settings.payments_synced_at IS
  'Moment the most recently imported LeagueSafe register was exported from LeagueSafe. Player-facing watermark: "no payment recorded as of <this>".';
