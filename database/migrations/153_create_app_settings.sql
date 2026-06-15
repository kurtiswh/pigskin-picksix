-- Migration 153: Central app settings (single source of truth for active season)
--
-- PROBLEM:
--   "Current season" was hardcoded across ~20 files. Some used a literal 2025,
--   others used new Date().getFullYear() -- which silently became 2026 once the
--   calendar rolled, querying a season with no data ("no data found"). There was
--   no clean season-rollover process.
--
-- FIX:
--   A singleton app_settings row holds the active_season (admin-controlled) plus
--   grace_period_weeks (how many early weeks show unpaid players before gating to
--   paid-only). The app reads this at startup; rollover becomes a one-row update.

CREATE TABLE IF NOT EXISTS public.app_settings (
    id boolean PRIMARY KEY DEFAULT true,
    active_season integer NOT NULL,
    grace_period_weeks integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- enforce a single row
    CONSTRAINT app_settings_singleton CHECK (id = true)
);

-- Seed with the current/last-completed season. Defaults to 2025 until rolled over.
INSERT INTO public.app_settings (id, active_season, grace_period_weeks)
VALUES (true, 2025, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Everyone may read the active season (needed before login, on the public site).
DROP POLICY IF EXISTS app_settings_read ON public.app_settings;
CREATE POLICY app_settings_read ON public.app_settings
    FOR SELECT TO anon, authenticated
    USING (true);

-- Only admins may change it (season rollover / grace period).
DROP POLICY IF EXISTS app_settings_admin_write ON public.app_settings;
CREATE POLICY app_settings_admin_write ON public.app_settings
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
    WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- keep updated_at fresh
CREATE OR REPLACE FUNCTION public.app_settings_touch_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_settings_touch ON public.app_settings;
CREATE TRIGGER app_settings_touch
    BEFORE UPDATE ON public.app_settings
    FOR EACH ROW EXECUTE FUNCTION public.app_settings_touch_updated_at();
