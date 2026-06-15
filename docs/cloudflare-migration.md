# Phase 3 Runbook — Cloudflare Workers + Key Security

This is the **interactive** checklist for steps that need your accounts/credentials.
The code/config is already in the repo (branch `phase3-cloudflare-keys`).

## 1. Rotate the exposed keys (do this first — they're in git history)

Both keys were committed in `.env.example` and shipped in the old client bundle, so
treat them as compromised.

- **Resend:** https://resend.com/api-keys → revoke the old key (`re_2qTSnsg5…`),
  create a new one.
- **CFBD:** https://collegefootballdata.com/ → regenerate your API key.

## 2. Put the secrets in Supabase (server-side, never in the client)

```bash
supabase secrets set RESEND_API_KEY=<new_resend_key>
supabase secrets set CFBD_API_KEY=<new_cfbd_key>
# verify:
supabase secrets list
```

These are read by the Edge Functions (`send-email`, `live-score-updater`, etc.)
via `Deno.env.get(...)`. Redeploy the functions if needed:

```bash
supabase functions deploy send-email
supabase functions deploy live-score-updater
```

## 3. Cloudflare Workers — first deploy

```bash
wrangler login                 # opens browser, authorize your Cloudflare account
npm run build                  # builds ./dist (needs VITE_SUPABASE_* in your .env)
wrangler deploy                # or: npm run deploy  (build + deploy)
```

`wrangler.toml` is assets-only with SPA fallback — no server code, just the static
SPA, replacing Vercel. First deploy gives you a `*.workers.dev` URL to test.

## 4. Custom domain

In the Cloudflare dashboard → Workers & Pages → your worker → **Settings → Domains
& Routes → Add custom domain**, point your domain at the worker. If the domain's DNS
isn't on Cloudflare yet, add the site to Cloudflare first and update your registrar's
nameservers.

## 5. Decommission Vercel

Once the Cloudflare domain serves correctly, remove the Vercel deployment / domain
so there aren't two live copies.

## Notes
- Client build vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are baked in at
  `npm run build` time. The anon key is safe to expose (RLS-protected).
- No secret keys are in the client anymore. Keep it that way: anything sensitive
  goes through a Supabase Edge Function.
- **CFBD client calls:** still pending a decision — see the Phase 3 status notes.
  Until that's resolved, `VITE_CFBD_API_KEY` may still be needed at build time.
