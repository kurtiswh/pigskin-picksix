/**
 * Exercise the reconciliation workbook builder against real data, outside a
 * browser, and write the file so it can be opened.
 *
 *   node scripts/check-reconciliation-workbook.mjs [season] [week]
 *
 * The builder in src/services/reconciliationWorkbook.ts is what the Download
 * button calls; only the save step differs (blob there, file here). This is the
 * way to check a change to the sheet structure without clicking through the
 * admin UI — the library rejects a malformed sheet, so a clean run here means
 * the button produces a valid workbook.
 *
 * Writes to the repo root, where the filename is gitignored: the workbook
 * carries player names, addresses and payment detail.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import writeXlsxFile from 'write-excel-file/node'
import ts from 'typescript'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
const env = Object.fromEntries(
  readFileSync(join(REPO, '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

// Compile just the builder, with the supabase import stubbed: it is only used
// by the download wrapper, which this script replaces.
const src = readFileSync(join(REPO, 'src/services/reconciliationWorkbook.ts'), 'utf8')
  .replace(/^import writeXlsxFile.*$/m, '')
  .replace(/^import \{ supabase \}.*$/m, 'const supabase = null')
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { buildReconciliationSheets } = await import(
  'data:text/javascript;base64,' + Buffer.from(js).toString('base64')
)

const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const season = Number(process.argv[2] ?? 2026)
const week = Number(process.argv[3] ?? 1)

const { data, error } = await sb.rpc('wr_reconciliation', { p_season: season, p_week: week })
if (error) throw new Error(`wr_reconciliation failed: ${error.message}`)

const sheets = buildReconciliationSheets(data, season, week)
console.log(`${sheets.length} sheets:`)
for (const sh of sheets) {
  console.log(`  ${String(sh.sheet).padEnd(26)} ${sh.data.length} rows`)
}

const out = join(REPO, `leaguesafe-reconciliation-${season}-week-${week}.xlsx`)
const buffer = await writeXlsxFile(sheets).toBuffer()
writeFileSync(out, buffer)
console.log(`\nwrote ${out} (${Math.round(buffer.length / 1024)} KB)`)
