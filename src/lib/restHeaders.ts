import { supabase } from './supabase'
import { ENV } from './env'

/**
 * Headers for direct PostgREST calls that must run as the signed-in user.
 *
 * Several admin flows bypass the supabase-js client and hit /rest/v1 with
 * fetch(). Those hand-built headers used the anon key as the bearer token, so
 * Postgres saw the `anon` role and auth.uid() was NULL — meaning an admin's
 * writes were evaluated against the anon policies. That was invisible until
 * migration 200 dropped the blanket `true` policies on week_settings and
 * games, after which every such write failed with 42501.
 *
 * `apikey` stays the anon key (it identifies the project); `Authorization`
 * must carry the user's access token for RLS to see who they are.
 */
export async function getRestHeaders(
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const anonKey = ENV.SUPABASE_ANON_KEY || ''

  let accessToken: string | undefined
  try {
    const { data } = await supabase.auth.getSession()
    accessToken = data.session?.access_token
  } catch (err) {
    console.warn('⚠️ Could not read session for REST headers:', err)
  }

  if (!accessToken) {
    // Falling back to the anon key keeps read-only calls working, but any
    // admin-gated write will be rejected by RLS. Say so loudly.
    console.warn('⚠️ No access token available — request will run as anon and admin-only writes will fail RLS.')
  }

  return {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken || anonKey}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}
