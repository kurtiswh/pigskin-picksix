import writeXlsxFile from 'write-excel-file/browser'
import { supabase } from '@/lib/supabase'

/**
 * Build the weekly reconciliation workbook in the browser.
 *
 * Same nine tabs scripts/build-reconciliation-workbook.py produces, from the
 * same queries — wr_reconciliation (migration 243) returns the whole payload in
 * one admin-gated call — so the commissioner does not need psql, python and a
 * database URL on the machine they happen to be holding. The runbook that says
 * what to do with each tab is docs/WEEKLY_RECONCILIATION.md.
 *
 * The file carries every player's name, addresses and payment detail. It is a
 * download, never a link.
 */

const BROWN = '#4B3621'
const HEADER_TEXT = '#FFFFFF'
const FLAG_BG = '#FBE9EC'
const WARN_BG = '#FFF5E2'
const NOTE_TEXT = '#5C5145'

type Row = Record<string, any>
type ColSpec = { key: string; label: string; width?: number }

/** Header + body, with the header frozen and flagged rows tinted. */
function table(cols: ColSpec[], rows: Row[], opts: { note?: string; flagKey?: string } = {}) {
  const data: any[][] = []
  if (opts.note) {
    data.push([{ value: opts.note, fontStyle: 'italic', fontSize: 10, textColor: NOTE_TEXT }])
    data.push([])
  }
  data.push(cols.map(c => ({
    value: c.label,
    fontWeight: 'bold' as const,
    textColor: HEADER_TEXT,
    backgroundColor: BROWN,
    fontSize: 10,
    wrap: true,
  })))
  for (const r of rows) {
    const flagged = opts.flagKey ? String(r[opts.flagKey] ?? '').trim().length > 0 : false
    const bg = flagged
      ? (/NOT PAID|no payment/i.test(String(r[opts.flagKey!])) ? FLAG_BG : WARN_BG)
      : undefined
    data.push(cols.map(c => {
      const v = r[c.key]
      const cell: any = { fontSize: 10, backgroundColor: bg }
      if (v === null || v === undefined || v === '') { cell.value = null; cell.type = String }
      else if (typeof v === 'number') { cell.value = v; cell.type = Number }
      else if (typeof v === 'boolean') { cell.value = v ? 'yes' : 'no'; cell.type = String }
      else { cell.value = String(v); cell.type = String }
      return cell
    }))
  }
  return {
    data,
    columns: cols.map(c => ({ width: c.width ?? Math.min(Math.max(c.label.length + 4, 12), 42) })),
    stickyRowsCount: opts.note ? 3 : 1,
  }
}

/**
 * One row per player and game, each sheet's pick beside the others. Columns are
 * by source rather than a per-player sheet order, because that is what reads at
 * a glance; the submission address is appended only when a player holds two
 * sheets of the same kind (two anonymous entries), which is the one case where
 * the column alone is ambiguous.
 */
function pivotDifferences(rows: Row[]) {
  const sourceCount = new Map<string, Set<string>>()
  for (const r of rows) {
    const key = `${r.player}|${r.sheet}`
    const set = sourceCount.get(key) ?? new Set<string>()
    set.add(r.submitted_under)
    sourceCount.set(key, set)
  }

  const byPlayerGame = new Map<string, Row>()
  for (const r of rows) {
    const key = `${r.player}|${r.matchup}`
    const row = byPlayerGame.get(key) ?? {
      player: r.player, matchup: r.matchup,
      account: '—', anon: '—', anon2: '', difference: 'same',
    }
    const ambiguous = (sourceCount.get(`${r.player}|${r.sheet}`)?.size ?? 1) > 1
    const cell = `${r.is_lock ? '🔒 ' : ''}${r.pick}`
      + (r.counted ? '' : ' (ignored)')
      + (ambiguous ? ` — ${r.submitted_under}` : '')
    if (r.sheet === 'anonymous') {
      if (row.anon === '—') row.anon = cell
      else row.anon2 = cell
    } else {
      row.account = cell
    }
    if (r.differs) row.difference = 'DIFFERENT'
    byPlayerGame.set(key, row)
  }
  return Array.from(byPlayerGame.values())
}

export function buildReconciliationSheets(data: any, season: number, week: number): any[] {
  const s = data.summary
  const money = (n: any) => (n === null || n === undefined ? '' : Number(n))

  const summaryRows: Array<[string, any, string]> = [
    ['THE REGISTER', '', ''],
    ['LeagueSafe rows on file', s.register_rows, "Compare against today's LeagueSafe CSV — if this differs, the import is stale"],
    ['Paid', s.paid, ''],
    ['Not paid', s.not_paid, 'Money outstanding — see Money issues'],
    ['Rows with no account linked', s.no_account_linked, 'Should be 0'],
    ['Dollars collected', money(s.dollars_collected), ''],
    ['', '', ''],
    ['WHO IS BEING SCORED', '', ''],
    ['On the season leaderboard', s.on_leaderboard,
      `= ${s.paid_with_picks} paid with picks + ${s.unpaid_with_picks} unpaid, still inside the grace period`],
    ['Paid, submitted nothing', s.paid_submitted_none,
      `${s.split_identities} of these are playing under another address`],
    ['', '', ''],
    ['WHAT TO ACT ON', '', ''],
    ['Split identities to merge', data.split_identities.length, 'Run database/merge_split_identities.sql — tab: Split identities'],
    ['Playing with no payment', data.playing_unpaid.length, 'After the split identities are accounted for'],
    ['Paid no-shows', data.paid_no_picks.length, 'Paid, no sheet anywhere'],
    ['Entries with money unsettled', data.money_issues.length, 'Pending transfers and overpayments'],
    [`Sheets on file for players holding more than one (week ${week})`, data.duplicate_sheets.length, 'See Sheet differences'],
    [`Anonymous entries still to tie (week ${week})`, data.anonymous_to_tie.length, 'Tie them from the Anonymous picks row in Week Review'],
    ['', '', ''],
    ['GRACE PERIOD', '', ''],
    ['grace_period_weeks', s.grace_period_weeks, 'Unpaid players stay on the board while weeks-with-games <= this'],
    ['Weeks with games selected', s.weeks_with_games, 'When this passes the grace period, an unmerged split costs a PAID player their standing'],
  ]

  const summarySheet = {
    sheet: 'Summary',
    showGridLines: false,
    columns: [{ width: 54 }, { width: 16 }, { width: 66 }],
    data: [
      [{ value: `LeagueSafe reconciliation — season ${season}, week ${week}`, fontWeight: 'bold' as const, fontSize: 16, textColor: BROWN, columnSpan: 3 }],
      [{ value: `Generated ${new Date().toLocaleString()} · runbook: docs/WEEKLY_RECONCILIATION.md`, fontStyle: 'italic' as const, fontSize: 10, textColor: NOTE_TEXT, columnSpan: 3 }],
      [],
      ...summaryRows.map(([label, value, note]) =>
        label && !value && label === label.toUpperCase()
          ? [{ value: label, fontWeight: 'bold' as const, fontSize: 9, textColor: '#C9A04E' }]
          : label
            ? [
                { value: label, fontSize: 11 },
                typeof value === 'number'
                  ? { value, type: Number, fontWeight: 'bold' as const, fontSize: 11, textColor: BROWN, align: 'right' as const }
                  : { value: String(value ?? ''), type: String, fontSize: 11 },
                { value: note, fontSize: 9, textColor: NOTE_TEXT },
              ]
            : [],
      ),
    ],
  }

  const sheets: any[] = [
    summarySheet,
    {
      sheet: 'Register',
      ...table([
        { key: 'leaguesafe_owner', label: 'LeagueSafe owner', width: 24 },
        { key: 'leaguesafe_email', label: 'LeagueSafe email', width: 34 },
        { key: 'status', label: 'Status' },
        { key: 'entry_fee', label: 'Entry fee' },
        { key: 'paid', label: 'Paid' },
        { key: 'pending', label: 'Pending' },
        { key: 'owes', label: 'Owes' },
        { key: 'account_name', label: 'Account name', width: 24 },
        { key: 'account_email', label: 'Account email', width: 34 },
        { key: 'submitted_picks', label: 'Submitted picks' },
        { key: 'anon_picks', label: 'Anon picks' },
        { key: 'points', label: 'Points' },
        { key: 'issues', label: 'Issues', width: 60 },
      ], data.register, {
        note: `Every LeagueSafe row for ${season}, joined to the account and its picks. Flagged rows sort to the top; filter the Issues column.`,
        flagKey: 'issues',
      }),
    },
    {
      sheet: 'Split identities',
      ...table([
        { key: 'paid_as', label: 'Paid as', width: 22 },
        { key: 'payment_email', label: 'Payment email', width: 34 },
        { key: 'dollars', label: 'Dollars' },
        { key: 'playing_as', label: 'Playing as', width: 22 },
        { key: 'account_email', label: 'Account email', width: 34 },
        { key: 'evidence', label: 'Evidence', width: 52 },
        { key: 'ghost_can_log_in', label: 'Ghost can log in' },
        { key: 'player_can_log_in', label: 'Player can log in' },
        { key: 'merge_this_account', label: 'Merge this account', width: 38 },
        { key: 'into_this_account', label: 'Into this account', width: 38 },
      ], data.split_identities, {
        note: 'Paid under the left address, playing under the right. Merge the ghost INTO the playing account: no ghost has a login, so nothing breaks. Deploy the importer fix first or the next CSV upload undoes it.',
      }),
    },
    {
      sheet: 'Playing unpaid',
      ...table([
        { key: 'playing_as', label: 'Playing as', width: 24 },
        { key: 'account_email', label: 'Account email', width: 34 },
        { key: 'leaguesafe_row', label: 'LeagueSafe row' },
        { key: 'owes', label: 'Owes' },
        { key: 'submitted_picks', label: 'Submitted picks' },
        { key: 'anon_picks', label: 'Anon picks' },
        { key: 'points_on_board', label: 'Points on board' },
      ], data.playing_unpaid, {
        note: 'Sheets being scored with no payment traceable anywhere, after the split identities are accounted for. These drop off the board when the grace period closes.',
      }),
    },
    {
      sheet: 'Paid no picks',
      ...table([
        { key: 'paid_as', label: 'Paid as', width: 24 },
        { key: 'payment_email', label: 'Payment email', width: 34 },
        { key: 'dollars', label: 'Dollars' },
        { key: 'account_name', label: 'Account name', width: 24 },
        { key: 'account_email', label: 'Account email', width: 34 },
      ], data.paid_no_picks, {
        note: 'Paid, and no sheet anywhere in the system under any address we can find. Genuine no-shows unless they play later.',
      }),
    },
    {
      sheet: 'Money issues',
      ...table([
        { key: 'leaguesafe_owner', label: 'LeagueSafe owner', width: 24 },
        { key: 'leaguesafe_email', label: 'LeagueSafe email', width: 34 },
        { key: 'status', label: 'Status' },
        { key: 'entry_fee', label: 'Entry fee' },
        { key: 'paid', label: 'Paid' },
        { key: 'pending', label: 'Pending' },
        { key: 'owes', label: 'Owes' },
        { key: 'reading', label: 'What it means', width: 40 },
      ], data.money_issues, {
        note: 'Dollars that do not match the entry fee. "Paid" with a pending transfer means the money is not in yet.',
      }),
    },
    {
      sheet: `Duplicate sheets W${week}`,
      ...table([
        { key: 'player', label: 'Player', width: 22 },
        { key: 'account_email', label: 'Account email', width: 30 },
        { key: 'sheet', label: 'Sheet' },
        { key: 'submitted_under', label: 'Submitted under', width: 30 },
        { key: 'pick_count', label: 'Picks' },
        { key: 'counted_picks', label: 'Counted picks' },
        { key: 'lock_count', label: 'Locks' },
        { key: 'counted_locks', label: 'Counted locks' },
        { key: 'is_submitted', label: 'Submitted' },
        { key: 'points_on_file', label: 'Points on file' },
        { key: 'counted_points', label: 'Counted points' },
        { key: 'counts', label: 'Counts' },
        { key: 'submitted_at', label: 'Submitted at', width: 22 },
      ], data.duplicate_sheets, {
        note: `Week ${week}: every sheet on file for a player who has more than one. Counting is per pick. The next tab shows where the sheets actually differ.`,
      }),
    },
    {
      sheet: 'Sheet differences',
      ...table([
        { key: 'player', label: 'Player', width: 22 },
        { key: 'matchup', label: 'Game', width: 32 },
        { key: 'account', label: 'Account sheet', width: 26 },
        { key: 'anon', label: 'Anonymous entry', width: 26 },
        { key: 'anon2', label: 'Anonymous entry 2', width: 26 },
        { key: 'difference', label: 'Difference', width: 16 },
      ], pivotDifferences(data.sheet_differences), {
        note: "One row per game per player, with each sheet's pick side by side. DIFFERENT marks the games the sheets disagree on — a different team, a moved lock, or a pick on only one sheet.",
        flagKey: 'difference',
      }),
    },
    {
      sheet: 'Anonymous to tie',
      ...table([
        { key: 'entry_name', label: 'Entry name', width: 24 },
        { key: 'entry_email', label: 'Entry email', width: 32 },
        { key: 'picks', label: 'Picks' },
        { key: 'locks', label: 'Locks' },
        { key: 'submitted_at', label: 'Submitted at', width: 22 },
        { key: 'suggested_account', label: 'Suggested account', width: 24 },
        { key: 'suggested_email', label: 'Suggested email', width: 32 },
        { key: 'suggested_is_paid', label: 'Suggested is paid' },
      ], data.anonymous_to_tie, {
        note: `Week ${week} entries not tied to an account, with the account the system resolves each to. A blank suggestion needs a manual tie — do it from the Anonymous picks row in Week Review.`,
      }),
    },
  ]

  return sheets
}

export async function downloadReconciliationWorkbook(season: number, week: number): Promise<string> {
  const { data, error } = await supabase.rpc('wr_reconciliation', { p_season: season, p_week: week })
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No reconciliation data returned')

  const sheets = buildReconciliationSheets(data, season, week)
  const fileName = `leaguesafe-reconciliation-${season}-week-${week}.xlsx`
  // The browser build hands back a blob rather than saving; do the save here so
  // the filename carries the season and week.
  const blob = await writeXlsxFile(sheets).toBlob()
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    // Revoke on the next tick: Safari cancels the download if the URL dies first.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  return fileName
}
