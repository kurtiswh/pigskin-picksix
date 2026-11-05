/**
 * Contest times are set in US Central time (America/Chicago), which observes daylight
 * saving. Lock times used to be written as fixed UTC hours (16:00 = "11 AM CT",
 * 23:00 = "6 PM CT"), which is only true during daylight time: after DST ended on
 * 2026-11-01 every default lock landed an hour early. Everything here derives the UTC
 * instant from the Central wall-clock time for that specific date, and decides which day
 * a game is on in Central time rather than in the viewer's browser timezone.
 */

const TZ = 'America/Chicago'

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
  weekday: 'short',
})

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

interface CentralParts {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  second: number
  weekday: number // 0 = Sunday
}

/** The Central-time calendar fields of an instant */
export function centralParts(date: Date): CentralParts {
  const p: Record<string, string> = {}
  for (const { type, value } of partsFormatter.formatToParts(date)) p[type] = value
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: WEEKDAYS[p.weekday],
  }
}

/** Central time minus UTC at this instant, in ms (e.g. -5h in CDT, -6h in CST) */
function centralOffsetMs(date: Date): number {
  const c = centralParts(date)
  const asUtc = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** The instant when the wall clock in Central reads this date and time */
export function centralWallTime(year: number, month: number, day: number, hour: number, minute = 0): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute)
  let t = naive - centralOffsetMs(new Date(naive))
  // Second pass settles dates near a DST switch, where the first guess used the other offset
  t = naive - centralOffsetMs(new Date(t))
  return new Date(t)
}

/** Central calendar date shifted by whole days (handles month/year rollover) */
function addDays(year: number, month: number, day: number, days: number) {
  const d = new Date(Date.UTC(year, month - 1, day + days))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/**
 * The Saturday a game belongs to, as a Central calendar date. Wednesday to Saturday games
 * belong to the upcoming Saturday; Sunday to Tuesday games to the previous one.
 */
export function weekSaturdayFor(kickoff: Date) {
  const c = centralParts(kickoff)
  const shift = c.weekday === 6 ? 0 : c.weekday >= 3 ? 6 - c.weekday : -(c.weekday + 1)
  return addDays(c.year, c.month, c.day, shift)
}

/** Weekly pick deadline: Saturday 11:00 AM Central of the week this game belongs to */
export function saturdayDeadlineFor(kickoff: Date): Date {
  const s = weekSaturdayFor(kickoff)
  return centralWallTime(s.year, s.month, s.day, 11, 0)
}

/** True for games played Thursday or Friday in Central time */
export function isThursdayFridayGame(kickoff: Date): boolean {
  const wd = centralParts(kickoff).weekday
  return wd === 4 || wd === 5
}

/**
 * Default lock time for a game: Thursday/Friday games lock at 6:00 PM Central on game day;
 * everything else at the week's Saturday 11:00 AM Central deadline.
 */
export function defaultGameLockTime(kickoff: Date): Date {
  if (isThursdayFridayGame(kickoff)) {
    const c = centralParts(kickoff)
    return centralWallTime(c.year, c.month, c.day, 18, 0)
  }
  return saturdayDeadlineFor(kickoff)
}
