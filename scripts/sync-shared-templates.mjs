#!/usr/bin/env node
/**
 * Copy the email templates the send-email Edge Function needs into
 * supabase/functions/_shared/templates/.
 *
 * Why a copy at all: the Supabase CLI only uploads what lives under
 * supabase/functions/, so an Edge Function cannot import from src/. Rather than
 * maintain the templates twice and let them drift, src/templates/ stays the one
 * source of truth and this script regenerates the shared copies. Deno needs
 * explicit file extensions, so relative imports get `.ts` appended on the way.
 *
 * You should not need to run this by hand: `npm run deploy:functions` syncs
 * before it deploys, so what ships is always current. The rest are for when you
 * want the copies updated or verified on their own:
 *
 *   npm run deploy:functions   # sync, then deploy send-email
 *   npm run sync:templates     # regenerate the copies
 *   npm run check:templates    # verify only, non-zero exit if stale
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src', 'templates')
const DEST = join(ROOT, 'supabase', 'functions', '_shared', 'templates')

const FILES = ['types.ts', 'emailShell.ts', 'picksSubmitted.ts', 'recapEmail.ts']

const HEADER = `// GENERATED FILE — DO NOT EDIT.
// Source: src/templates/%s
// Regenerate: node scripts/sync-shared-templates.mjs
`

/** Rewrite \`from './x'\` to \`from './x.ts'\` — Deno requires the extension. */
const addExtensions = (code) =>
  code.replace(/(\bfrom\s+['"])(\.\.?\/[^'"]+?)(['"])/g, (m, a, spec, b) =>
    /\.[a-z]+$/.test(spec) ? m : `${a}${spec}.ts${b}`
  )

const render = (name) => HEADER.replace('%s', name) + '\n' + addExtensions(readFileSync(join(SRC, name), 'utf8'))

const check = process.argv.includes('--check')
if (!check) mkdirSync(DEST, { recursive: true })

let stale = 0
for (const name of FILES) {
  const want = render(name)
  const path = join(DEST, name)
  const have = existsSync(path) ? readFileSync(path, 'utf8') : null
  if (have === want) continue
  if (check) {
    console.error(`✗ out of date: supabase/functions/_shared/templates/${name}`)
    stale++
  } else {
    writeFileSync(path, want)
    console.log(`✓ wrote supabase/functions/_shared/templates/${name}`)
  }
}

if (check && stale) {
  console.error(`\n${stale} shared template(s) out of date. Run: node scripts/sync-shared-templates.mjs`)
  process.exit(1)
}
if (check) console.log('✓ shared templates are in sync')
