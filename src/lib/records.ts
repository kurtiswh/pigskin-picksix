/**
 * Display formatting for win-loss-push records.
 *
 * Records are built as `W-L-P` strings by the services, but the push column is
 * zero for most players most weeks, so it spent width saying nothing. Dropping
 * a trailing `-0` follows the convention the rest of the app already uses
 * (RecordsTab renders locks as `12-4`) and the one every sports standings page
 * uses: no third number means no pushes.
 *
 * Anything that is not a plain `W-L-P` triple is returned untouched, so the
 * weekly lock column ("Win" / "Loss" / "Push" / "—") passes straight through.
 */
export function formatRecord(record?: string | null): string {
  if (!record) return record ?? ''
  const match = /^(\d+)-(\d+)-(\d+)$/.exec(record.trim())
  if (!match) return record
  const [, wins, losses, pushes] = match
  return pushes === '0' ? `${wins}-${losses}` : record
}
