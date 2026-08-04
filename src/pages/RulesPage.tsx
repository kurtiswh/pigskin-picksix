import { Link } from 'react-router-dom'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getPayoutStructure, POINT_PLACES } from '@/types/winners'
import {
  ADMIN_EMAIL,
  ENTRY_DEADLINE_LABEL,
  ENTRY_FEE,
  ENTRY_FEE_WITH_FEES,
  LEAGUESAFE_ABOUT_URL,
  LEAGUESAFE_ACCOUNT_URL,
  LEAGUESAFE_JOIN_URL,
  LEAGUESAFE_PAY_URL,
  REGULAR_SEASON_WEEKS,
  RULES_PDF_PATH,
  RULES_SEASON,
} from '@/lib/league'

/**
 * Official Rules — the web version of the "Pigskin Pick Six Official Rules" PDF
 * (linked at the top of the page for download). The payout table renders
 * straight from the season's payout structure so it can never drift from what
 * the app actually pays.
 */

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-2xl font-extrabold tracking-wide text-pigskin-900 uppercase border-b-2 border-[#C9A04E] pb-2 mb-4">
    {children}
  </h2>
)

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <li className="flex gap-2.5 text-charcoal-700 leading-relaxed">
    <span className="text-[#C9A04E] font-bold shrink-0">►</span>
    <span>{children}</span>
  </li>
)

export default function RulesPage() {
  const p = getPayoutStructure(RULES_SEASON)
  const weeklyPool = p.weekly_winner * p.weeks
  const payoutRows: [string, string][] = [
    ...POINT_PLACES
      .filter(place => p[place.key] != null)
      .map(place => [`Points — ${place.place}`, `${p[place.key]}%`] as [string, string]),
    ['Lock of the Week — 1st', `${p.lock_winner}%`],
    ['Lock of the Week — 2nd', `${p.lock_second}%`],
    ['Bracket — Winner', `${p.bracket_winner}%`],
    ['Bracket — Runner-up', `${p.bracket_second}%`],
    ['Best Finish', `${p.best_finish}%`],
  ]

  return (
    <Layout>
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="text-4xl mb-2">🏈</div>
        <h1 className="text-4xl font-extrabold tracking-wide text-pigskin-900 uppercase">
          Official Rules
        </h1>
        <p className="text-charcoal-500 mt-2">
          Pigskin Pick Six {RULES_SEASON} — how the contest works, start to finish.
        </p>
        <a
          href={RULES_PDF_PATH}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-5 px-4 py-2 rounded-lg border border-[#C9A04E] bg-[#fff8ea] text-pigskin-900 font-semibold hover:bg-[#C9A04E] hover:text-white transition-colors"
        >
          📄 Download the {RULES_SEASON} rules (PDF)
        </a>
      </div>

      <div className="space-y-8">
        {/* Overview */}
        <Card>
          <CardContent className="pt-6">
            <SectionTitle>Overview</SectionTitle>
            <ul className="space-y-3">
              <Bullet>
                Each week you get a pick sheet with <b>15 college football games</b>. You choose a
                point-spread winner in <b>six</b> of the 15, with one serving as your{' '}
                <b>🔒 Lock of the Week</b>.
              </Bullet>
              <Bullet>
                Point spreads are the average of the lines released by Las Vegas sportsbooks, and
                they're locked in when the slate is posted — the number on the pick sheet is the
                number you play.
              </Bullet>
              <Bullet>
                The 15 games are chosen on three criteria: (1) Top 25 matchups, (2) Big XII/SEC
                games of interest — specifically OSU and OU games, and (3) national games of
                interest, spread across the day.
              </Bullet>
              <Bullet>
                The slate goes out by email every <b>Wednesday or Thursday</b> and is posted here on{' '}
                <a href="https://pigskinpicksix.com" className="underline font-semibold text-pigskin-700">
                  pigskinpicksix.com
                </a>.
              </Bullet>
              <Bullet>
                Picks are made every week of the regular season, from the weekend of{' '}
                <b>September 5th through November 28th</b> — <b>{REGULAR_SEASON_WEEKS} weeks</b>.
              </Bullet>
            </ul>
          </CardContent>
        </Card>

        {/* Deadlines */}
        <Card>
          <CardContent className="pt-6">
            <SectionTitle>Making Picks &amp; Deadlines</SectionTitle>
            <ul className="space-y-3">
              <Bullet>
                Make your picks on the <Link to="/picks" className="underline font-semibold text-pigskin-700">Picks page</Link>{' '}
                and hit <b>Submit</b> — unsubmitted picks don't count. You can change picks any
                time before they lock.
              </Bullet>
              <Bullet>
                Your picks are due by <b>11:00 AM Saturday. No exceptions.</b> If a Thursday or
                Friday night game is among the 15 options <i>and</i> you want to pick it, your picks
                are due by 6:00 PM the day of that game.
              </Bullet>
            </ul>
            <div className="mt-5 rounded-lg border-2 border-[#C9A04E] bg-[#fff8ea] p-4">
              <div className="text-center font-extrabold uppercase tracking-wide text-[#8a6a1f] mb-3">
                Deadlines
              </div>
              <ul className="space-y-2 text-sm text-charcoal-700">
                <li>
                  If one of your picks includes a <b>Thursday</b> game: return by Thursday at{' '}
                  <b>6:00 PM</b>
                </li>
                <li>
                  If one of your picks includes a <b>Friday</b> game: return by Friday at{' '}
                  <b>6:00 PM</b>
                </li>
                <li>
                  If you do not pick a Thursday or Friday game: return by Saturday at{' '}
                  <b>11:00 AM</b>
                </li>
              </ul>
            </div>
            <p className="text-sm text-charcoal-500 mt-3">
              All times Central. The exact countdown for the current week is always shown on the
              pick sheet.
            </p>
          </CardContent>
        </Card>

        {/* Scoring */}
        <Card>
          <CardContent className="pt-6">
            <SectionTitle>Scoring System</SectionTitle>
            <div className="grid grid-cols-3 gap-3 mb-5 text-center">
              <div className="bg-[#F8F7F3] border border-[#e7e2da] rounded-lg py-3">
                <div className="text-2xl font-extrabold text-pigskin-900">20</div>
                <div className="text-xs font-semibold text-charcoal-500 uppercase">Win vs spread</div>
              </div>
              <div className="bg-[#F8F7F3] border border-[#e7e2da] rounded-lg py-3">
                <div className="text-2xl font-extrabold text-pigskin-900">10</div>
                <div className="text-xs font-semibold text-charcoal-500 uppercase">Push</div>
              </div>
              <div className="bg-[#F8F7F3] border border-[#e7e2da] rounded-lg py-3">
                <div className="text-2xl font-extrabold text-pigskin-900">0</div>
                <div className="text-xs font-semibold text-charcoal-500 uppercase">Loss</div>
              </div>
            </div>
            <p className="text-sm text-charcoal-600 mb-4">
              A push is a game that lands exactly on the number — a team favored by 5 that wins by 5.
            </p>
            <div className="mb-4">
              <div className="font-bold text-pigskin-900 mb-2">Bonus points</div>
              <ul className="space-y-2">
                <Bullet>Your team covers the spread by 11–19.5 points = <b>+1</b> bonus point</Bullet>
                <Bullet>Your team covers the spread by 20–28.5 points = <b>+3</b> bonus points</Bullet>
                <Bullet>Your team covers the spread by 29+ points = <b>+5</b> bonus points</Bullet>
                <Bullet>Bonus points are <b>doubled on your Lock of the Week</b>.</Bullet>
              </ul>
            </div>
            <div className="bg-[#F8F7F3] border border-[#e7e2da] rounded-lg p-4 text-sm text-charcoal-700 space-y-3">
              <div className="font-bold text-pigskin-900">Example — Texas Tech +5 at Kansas State −5</div>
              <p>
                <b>Scenario one:</b> you take K-State as one of your picks and they win 35–17. They
                covered the spread by 13 with an 18-point victory, so you earn 20 points + 1 bonus ={' '}
                <b>21 points</b>.
              </p>
              <p>
                <b>Scenario two:</b> you take Texas Tech as your Lock of the Week and they win
                35–17. They covered by 23, so you earn 20 points + (3 bonus × 2) ={' '}
                <b>26 points</b>.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Season championship */}
        <Card>
          <CardContent className="pt-6">
            <SectionTitle>Season Championship</SectionTitle>
            <ul className="space-y-3">
              <Bullet>
                The <b>winner is the player with the most points</b> at the end of the year.
              </Bullet>
              <Bullet>
                Tiebreakers, in order: (1) best overall record against the spread, (2) best Lock
                record.
              </Bullet>
              <Bullet>
                Weekly results are posted on the site, and the top{' '}
                {POINT_PLACES.filter(place => p[place.key] != null).length} point finishers are paid
                out of the pot — see the payout table below.
              </Bullet>
            </ul>
          </CardContent>
        </Card>

        {/* Side contests */}
        <Card>
          <CardContent className="pt-6">
            <SectionTitle>Side Contests</SectionTitle>
            <div className="space-y-5">
              <div>
                <div className="font-bold text-pigskin-900 mb-2">🔒 Lock of the Week award</div>
                <ul className="space-y-2">
                  <Bullet>
                    Each week, one of your six picks is your Lock of the Week. At the end of the
                    year the best season-long Lock record wins its own prize. Lock records are
                    scored in units: correct = <b>1</b>, push = <b>½</b>, incorrect = <b>0</b> (a
                    9-1-3 Lock record is worth 10.5 units).
                  </Bullet>
                  <Bullet>Ties for the best Lock record are broken by most total points.</Bullet>
                </ul>
              </div>
              <div>
                <div className="font-bold text-pigskin-900 mb-2">🏆 Weekly winner</div>
                <ul className="space-y-2">
                  <Bullet>
                    The player with the most points each week wins <b>${p.weekly_winner}</b> to keep
                    every Saturday interesting.
                  </Bullet>
                  <Bullet>
                    Tiebreakers: (1) best record for the week, (2) the player who hit their Lock,
                    (3) split the money evenly.
                  </Bullet>
                </ul>
              </div>
              <div>
                <div className="font-bold text-pigskin-900 mb-2">🗑️ Elimination bracket</div>
                <ul className="space-y-2">
                  <Bullet>
                    <b>After Week 6</b>, the top 128 players in the standings are seeded into a
                    single-elimination, March-Madness-style bracket. Your seed is your rank at that
                    point.
                  </Bullet>
                  <Bullet>
                    Each week you go head-to-head against one other competitor and the higher weekly
                    score advances: 128 players in Week 7, 64 in Week 8, 32 in Week 9, 16 in Week 10,
                    and on down to the champion in Week {REGULAR_SEASON_WEEKS}.
                  </Bullet>
                  <Bullet>
                    Tiebreakers: (1) most total points on the season, (2) most points the previous
                    week.
                  </Bullet>
                  <Bullet>
                    The bracket is a side pot — keep making picks all season even if you're
                    eliminated.
                  </Bullet>
                </ul>
              </div>
              <div>
                <div className="font-bold text-pigskin-900 mb-2">🏁 Best Finish (4th-quarter award)</div>
                <ul className="space-y-2">
                  <Bullet>
                    One last chance to hit paydirt: most points over the <b>final four weeks</b> of
                    the season (Weeks {REGULAR_SEASON_WEEKS - 3}–{REGULAR_SEASON_WEEKS}) wins.
                  </Bullet>
                  <Bullet>
                    Tiebreakers: (1) best record over those four weeks, (2) best four-week Lock
                    record.
                  </Bullet>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cancelled games */}
        <Card>
          <CardContent className="pt-6">
            <SectionTitle>Cancelled Games</SectionTitle>
            <ul className="space-y-3">
              <Bullet>
                If one of the games you picked is cancelled due to weather or any other reason, you
                get to make up the game the following week.
              </Bullet>
              <Bullet>
                When a make-up leaves you with more than six games in a week, your{' '}
                <b>worst possible six-game score</b> is the one used for the weekly winner, the
                bracket, and Best Finish.
              </Bullet>
            </ul>
          </CardContent>
        </Card>

        {/* Payouts */}
        <Card>
          <CardHeader>
            <CardTitle>
              <SectionTitle>Payouts</SectionTitle>
            </CardTitle>
          </CardHeader>
          <CardContent className="-mt-6">
            <p className="text-sm text-charcoal-600 mb-4">
              Percentages are of the total pot after the weekly-winner payouts are set aside
              (${p.weekly_winner}/week × {p.weeks} weeks = ${weeklyPool.toLocaleString()}). All
              winnings are paid out after the last week of play.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#faf8f4] border-y border-[#ece7de] text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    <th className="text-left px-4 py-2">Prize</th>
                    <th className="text-right px-4 py-2">Share of pot</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutRows.map(([label, pct]) => (
                    <tr key={label} className="border-b border-[#ece7de]">
                      <td className="px-4 py-2 text-charcoal-700">{label}</td>
                      <td className="px-4 py-2 text-right font-semibold text-pigskin-900">{pct}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="px-4 py-2 text-charcoal-700">Weekly winner</td>
                    <td className="px-4 py-2 text-right font-semibold text-pigskin-900">
                      ${p.weekly_winner} / week
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Entry */}
        <Card>
          <CardContent className="pt-6">
            <SectionTitle>Entry Fee</SectionTitle>
            <ul className="space-y-3">
              <Bullet>
                The cost is <b>${ENTRY_FEE}</b> and it must be sent by{' '}
                <b>{ENTRY_DEADLINE_LABEL}</b>. IOUs will <b>not</b> be accepted.
              </Bullet>
              <Bullet>
                Entry fees are collected through <b>LeagueSafe</b>, the third-party escrow service
                built for pools like this one. LeagueSafe charges a 4% processing fee, so you're
                actually paying <b>${ENTRY_FEE_WITH_FEES.toFixed(2)}</b> to join, and each
                participant needs a LeagueSafe account. More on how it works at{' '}
                <a
                  href={LEAGUESAFE_ABOUT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold text-pigskin-700"
                >
                  leaguesafe.com/about
                </a>.
              </Bullet>
              <Bullet>
                Unpaid entries are hidden from the leaderboards after the early-season grace period.
              </Bullet>
              <Bullet>Feel free to pass this on to your family and friends. 🏈</Bullet>
            </ul>

            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <a
                href={LEAGUESAFE_JOIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center px-4 py-3 rounded-lg bg-[#C9A04E] text-pigskin-900 font-bold hover:bg-[#b78e3f] transition-colors"
              >
                Join &amp; pay on LeagueSafe
              </a>
              <a
                href={LEAGUESAFE_PAY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center px-4 py-3 rounded-lg border border-[#C9A04E] text-pigskin-900 font-semibold hover:bg-[#fff8ea] transition-colors"
              >
                Already in the league? Pay here
              </a>
            </div>

            <div className="mt-5 rounded-lg border border-[#f0dcb0] bg-[#fff8ea] p-4 text-sm text-charcoal-700">
              <div className="font-bold text-pigskin-900 mb-1">
                ⚠️ Use the same email in both places
              </div>
              <p>
                We match LeagueSafe payments to accounts <b>by email address</b>. Use the same email
                for LeagueSafe and for this site — or, if they're different, add your LeagueSafe
                email on your{' '}
                <Link to="/profile" className="underline font-semibold text-pigskin-700">
                  profile page
                </Link>{' '}
                so your payment lines up with your picks. Not sure which address LeagueSafe has?
                Check{' '}
                <a
                  href={LEAGUESAFE_ACCOUNT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold text-pigskin-700"
                >
                  your account settings
                </a>{' '}
                in the FanBall wallet. Questions? Email{' '}
                <a
                  href={`mailto:${ADMIN_EMAIL}`}
                  className="underline font-semibold text-pigskin-700"
                >
                  {ADMIN_EMAIL}
                </a>.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </Layout>
  )
}
