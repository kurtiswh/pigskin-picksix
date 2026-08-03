import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PAYOUT_PERCENTAGES } from '@/types/winners'

/**
 * Official Rules — adapted from the classic "Pigskin Pick Six Official Rules"
 * PDF, updated for the web platform. The payout table renders straight from
 * PAYOUT_PERCENTAGES so it can never drift from what the app actually pays.
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
  const p = PAYOUT_PERCENTAGES
  const payoutRows: [string, string][] = [
    ['Points — 1st', `${p.point_winner}%`],
    ['Points — 2nd', `${p.point_second}%`],
    ['Points — 3rd', `${p.point_third}%`],
    ['Points — 4th', `${p.point_fourth}%`],
    ['Points — 5th', `${p.point_fifth}%`],
    ['Points — 6th', `${p.point_sixth}%`],
    ['Points — 7th', `${p.point_seventh}%`],
    ['Points — 8th', `${p.point_eighth}%`],
    ['Points — 9th', `${p.point_ninth}%`],
    ['Points — 10th', `${p.point_tenth}%`],
    ['Lock of the Week — 1st', `${p.lock_winner}%`],
    ['Lock of the Week — 2nd', `${p.lock_second}%`],
    ['Bracket — Winner', `${p.bracket_winner}%`],
    ['Bracket — Runner-up', `${p.bracket_second}%`],
    ['Best Finish', `${p.best_finish}%`],
  ]

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="text-4xl mb-2">🏈</div>
        <h1 className="text-4xl font-extrabold tracking-wide text-pigskin-900 uppercase">
          Official Rules
        </h1>
        <p className="text-charcoal-500 mt-2">Pigskin Pick Six — how the contest works, start to finish.</p>
      </div>

      <div className="space-y-8">
        {/* Overview */}
        <Card>
          <CardContent className="pt-6">
            <SectionTitle>Overview</SectionTitle>
            <ul className="space-y-3">
              <Bullet>
                Each week you get a pick sheet with that week's slate of college football games —
                marquee matchups and games of national interest, selected by the commissioner.
              </Bullet>
              <Bullet>
                You pick a point-spread winner in <b>six</b> games. One of the six is your{' '}
                <b>🔒 Lock of the Week</b>.
              </Bullet>
              <Bullet>
                Point spreads come from Las Vegas sportsbook lines and are locked in when the
                slate is posted — the number on the pick sheet is the number you play.
              </Bullet>
              <Bullet>
                Picks run every week of the 14-week regular season, from kickoff weekend through
                early December.
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
                The standard deadline is <b>Saturday at 11:00 AM Central</b>. No exceptions.
              </Bullet>
              <Bullet>
                <b>Thursday and Friday games lock at 6:00 PM Central on game day.</b> The rest of
                your sheet stays open until the Saturday deadline.
              </Bullet>
              <Bullet>
                The exact countdown for the current week is always shown on the pick sheet.
              </Bullet>
            </ul>
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
            <div className="mb-4">
              <div className="font-bold text-pigskin-900 mb-2">Bonus points</div>
              <ul className="space-y-2">
                <Bullet>Cover the spread by 11–19.5 points = <b>+1</b> bonus point</Bullet>
                <Bullet>Cover the spread by 20–28.5 points = <b>+3</b> bonus points</Bullet>
                <Bullet>Cover the spread by 29+ points = <b>+5</b> bonus points</Bullet>
                <Bullet>Bonus points are <b>doubled on your Lock of the Week</b>.</Bullet>
              </ul>
            </div>
            <div className="bg-[#F8F7F3] border border-[#e7e2da] rounded-lg p-4 text-sm text-charcoal-700 space-y-3">
              <div className="font-bold text-pigskin-900">Example — Texas Tech +5 at Kansas State −5</div>
              <p>
                <b>Scenario one:</b> you take K-State and they win 35–17. They covered by 13, so you
                earn 20 points + 1 bonus = <b>21 points</b>.
              </p>
              <p>
                <b>Scenario two:</b> you take Texas Tech as your Lock and they win 35–17. They covered
                by 23, so you earn 20 points + (3 bonus × 2) = <b>26 points</b>.
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
                The <b>champion is the player with the most points</b> at the end of the season.
              </Bullet>
              <Bullet>
                Tiebreakers, in order: (1) best overall record against the spread, (2) best Lock
                record.
              </Bullet>
              <Bullet>
                The top ten point finishers are paid out of the pot — see the payout table below.
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
                    The best season-long Lock record wins its own prize. Lock records are scored in
                    units: win = <b>1</b>, push = <b>½</b>, loss = <b>0</b> (a 9-1-3 Lock record is
                    worth 10.5 units).
                  </Bullet>
                  <Bullet>Ties are broken by most total points.</Bullet>
                </ul>
              </div>
              <div>
                <div className="font-bold text-pigskin-900 mb-2">🏆 Weekly winner</div>
                <ul className="space-y-2">
                  <Bullet>
                    The player with the most points each week wins <b>${p.weekly_winner} </b>
                    to keep every Saturday interesting.
                  </Bullet>
                  <Bullet>
                    Tiebreakers: (1) best record for the week, (2) hit your Lock, (3) split the money.
                  </Bullet>
                </ul>
              </div>
              <div>
                <div className="font-bold text-pigskin-900 mb-2">🗑️ Elimination bracket</div>
                <ul className="space-y-2">
                  <Bullet>
                    After <b>Week 8</b>, the top of the standings is seeded into a single-elimination,
                    March-Madness-style bracket. Each week you go head-to-head — the higher weekly
                    score advances. Winner takes the bracket prize.
                  </Bullet>
                  <Bullet>
                    Tiebreakers: (1) most total points on the season, (2) most points the previous week.
                  </Bullet>
                  <Bullet>
                    The bracket is a side pot — keep making picks all season even if you're eliminated.
                  </Bullet>
                </ul>
              </div>
              <div>
                <div className="font-bold text-pigskin-900 mb-2">🏁 Best Finish (4th-quarter award)</div>
                <ul className="space-y-2">
                  <Bullet>
                    One last chance to hit paydirt: most points over the <b>final four weeks
                    (Weeks 11–14)</b> wins.
                  </Bullet>
                  <Bullet>
                    Tiebreakers: (1) best record over those four weeks, (2) best four-week Lock record.
                  </Bullet>
                </ul>
              </div>
            </div>
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
              Percentages are of the total pot after the weekly-winner payouts
              (${p.weekly_winner}/week × 14 weeks) are set aside. All winnings are paid out after
              the final week of play.
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
                Entry fees are collected through <b>LeagueSafe</b> — a third-party escrow service
                built for pools like this one. The pot is fully transparent and paid out at the end
                of the season.
              </Bullet>
              <Bullet>
                Your entry must be paid <b>before kickoff weekend</b>. IOUs are <b>not</b> accepted —
                unpaid entries are hidden from the leaderboards after the early-season grace period.
              </Bullet>
              <Bullet>
                The entry amount and LeagueSafe link are announced before each season in the signup
                email. Questions? Email{' '}
                <a href="mailto:admin@pigskinpicksix.com" className="underline font-semibold text-pigskin-700">
                  admin@pigskinpicksix.com
                </a>.
              </Bullet>
              <Bullet>Feel free to pass the signup link on to family and friends. 🏈</Bullet>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
