# Phase 3 Runbook — Cloudflare Workers + Key Security

This is the **interactive** checklist for steps that need your accounts/credentials.
The code/config is already in the repo (branch `phase3-cloudflare-keys`).

## 1. Rotate the Resend key (do this first — it's in git history)

The Resend key was committed in `.env.example` and shipped in the old client
bundle, so treat it as compromised. Resend can send email as your domain, so this
one matters.

- **Resend:** https://resend.com/api-keys → revoke the old key (`re_2qTSnsg5…`),
  create a new one.
- **CFBD:** read-only, free tier — no cost risk if exposed, so rotation is
  **optional**. The client still calls CFBD directly with `VITE_CFBD_API_KEY`
  (intentional — see Notes). Rotate only if you want the old key invalidated.

## 2. Set the server-side secrets in Supabase

```bash
supabase secrets set RESEND_API_KEY=<new_resend_key>   # used by send-email
# CFBD secret only needed for the automated live-score cron function:
supabase secrets set CFBD_API_KEY=<your_cfbd_key>      # used by live-score-updater
# verify:
supabase secrets list
```

These are read by the Edge Functions via `Deno.env.get(...)`. Redeploy if needed:

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
- The **Resend** secret is server-side only (send-email Edge Function); it is no
  longer a client `VITE_` var.
- **CFBD stays client-side** by choice — it's a read-only, free-tier key with no
  cost exposure, so it remains `VITE_CFBD_API_KEY` (needed at build time). It's
  also used server-side by the live-score-updater cron function.
