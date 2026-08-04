-- Migration 194: anonymous picks must land on the live account, not the shell
--
-- BUG: resolve_primary_user_id() — how anonymous picks get assigned to an
-- account — resolves an email to the OLDEST matching row ("prefer older
-- accounts"). That is backwards for the case migrations 190-193 just enabled:
-- a player adds their old LeagueSafe address to their profile, but the
-- import-created placeholder account still holds that same address and is
-- older, so it wins. Their picks would be assigned to the shell instead of to
-- them, and would not show on their profile until the merge happened.
--
-- Confirmed against production data (rolled back): with the address on a live
-- player's profile, lookup_player_by_email returned the live player while
-- resolve_primary_user_id returned the placeholder.
--
-- FIX: apply the same precedence lookup_player_by_email uses — an account
-- somebody actually signs into outranks one that has never authenticated.
-- The primary designation and age become tiebreakers beneath that, rather than
-- deciding it: the LeagueSafe import stamps is_primary_user_email = true on the
-- shell accounts it creates, so the old "primary designation wins outright"
-- branch handed the shell the win before liveness was ever considered.
-- canonical_user_id redirection is unchanged.

CREATE OR REPLACE FUNCTION public.resolve_primary_user_id(search_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    primary_user_id UUID;
    found_user_id UUID;
    canonical_id UUID;
BEGIN
    search_email := LOWER(TRIM(search_email));

    -- 1+2. Any account carrying this address, in precedence order.
    --
    -- These were two separate lookups: "is_primary_user_email = true wins
    -- outright", then "otherwise oldest". Both had to fold into one ordering,
    -- because the import stamps is_primary_user_email = true on the shell
    -- accounts it creates — so the old first branch handed the shell the win
    -- before any liveness check could run.
    --
    -- Precedence now: signed-in account first, then the primary designation,
    -- then age. Among accounts of equal standing the old behaviour is intact.
    SELECT ue.user_id INTO found_user_id
    FROM public.user_emails ue
    JOIN public.users u ON ue.user_id = u.id
    WHERE ue.email = search_email
        AND u.user_status = 'active'
    ORDER BY
        EXISTS (SELECT 1 FROM auth.users a
                WHERE a.id = u.id OR lower(a.email) = lower(u.email)) DESC,
        COALESCE(ue.is_primary_user_email, false) DESC,
        ue.created_at ASC
    LIMIT 1;

    IF found_user_id IS NOT NULL THEN
        SELECT canonical_user_id INTO canonical_id
        FROM public.users WHERE id = found_user_id;
        RETURN COALESCE(canonical_id, found_user_id);
    END IF;

    -- 3. Legacy fallback: the users table itself, same precedence.
    SELECT u.id INTO found_user_id
    FROM public.users u
    WHERE (u.email = search_email OR u.leaguesafe_email = search_email)
        AND u.user_status = 'active'
    ORDER BY
        EXISTS (SELECT 1 FROM auth.users a
                WHERE a.id = u.id OR lower(a.email) = lower(u.email)) DESC,
        u.created_at ASC
    LIMIT 1;

    IF found_user_id IS NOT NULL THEN
        SELECT canonical_user_id INTO canonical_id
        FROM public.users WHERE id = found_user_id;
        RETURN COALESCE(canonical_id, found_user_id);
    END IF;

    RETURN NULL;
END;
$function$;

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 194: resolve_primary_user_id now prefers a signed-in account over an import shell';
END;
$$;
