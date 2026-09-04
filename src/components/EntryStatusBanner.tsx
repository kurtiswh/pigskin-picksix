import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmailClaimService, MyPaymentStatus } from '@/services/emailClaimService'
import { LEAGUESAFE_ACCOUNT_URL, LEAGUESAFE_JOIN_URL, ENTRY_FEE_LABEL, PICK_DEADLINE_LABEL } from '@/lib/league'
import { usePaymentsSyncedAt } from '@/hooks/usePaymentsSyncedAt'

interface Props {
  season: number
}

/**
 * "Am I actually in this thing?" — shown above the pick sheet.
 *
 * Resolves the payment across EVERY email on the player's profile (sign-in,
 * LeagueSafe, or any address they've added). Four states, and every negative
 * one carries the payment watermark — the moment the LeagueSafe register was
 * last downloaded — plus the standing reassurance: the register is imported
 * by hand, so "not showing paid" usually means "paid after we last pulled it".
 * The paid states deliberately show no timestamp; good news needs no asterisk.
 */
export default function EntryStatusBanner({ season }: Props) {
  const [status, setStatus] = useState<MyPaymentStatus | null>(null)
  const syncedAt = usePaymentsSyncedAt()

  useEffect(() => {
    let cancelled = false
    EmailClaimService.myPaymentStatus(season)
      .then(result => { if (!cancelled) setStatus(result) })
      .catch(err => console.warn('Could not load entry status:', err?.message))
    return () => { cancelled = true }
  }, [season])

  if (!status) return null

  const asOf = syncedAt ? (
    <> as of <b className="tabular-nums whitespace-nowrap">{syncedAt}</b></>
  ) : null

  const profileLink = (label: string) => (
    <Link to="/profile" className="underline font-semibold text-pigskin-700">{label}</Link>
  )

  // 1A — paid and attached: one quiet line. Silence made paid people worry too.
  if (status.found && status.paid && status.linked) {
    return (
      <div className="rounded-lg border border-[#bfe3cc] bg-[#e6f4ea] px-5 py-2.5 text-sm text-[#2c4a37]">
        ✅ <b className="text-[#1f7a44]">You're paid for {season}</b> — all set. Good luck this week.
      </div>
    )
  }

  // 1D — paid, but under an email not yet attached to this login.
  if (status.found && status.paid && !status.linked) {
    return (
      <div className="rounded-lg border border-[#bfe3cc] bg-[#e6f4ea] px-5 py-3 text-sm text-[#2c4a37]">
        ✅ <b className="text-[#1f7a44]">You're paid for {season}</b> (entry under <b>{status.matched_email}</b>).
        <div className="text-[13px] mt-0.5">
          It's being attached to this account automatically — everything will show in one place on your {profileLink('profile')}.
        </div>
      </div>
    )
  }

  // 1B — entry found, register says not paid.
  if (status.found && !status.paid) {
    return (
      <div className="rounded-lg border border-[#f0dcb0] bg-[#fff8ea] px-5 py-4 text-sm text-charcoal-700 space-y-2">
        <div className="font-bold text-[#b06a1a]">
          No payment recorded for you{asOf}
          {syncedAt && <span className="font-normal"> — the last time we pulled the LeagueSafe register (it's imported by hand, so there's a lag).</span>}
        </div>
        <div><b>First: submit your picks.</b> They count no matter what — payments reconcile after, and the {PICK_DEADLINE_LABEL} deadline doesn't wait.</div>
        <div><b>If LeagueSafe shows you paid, you're good.</b> You'll get full credit, and we expect statuses updated before next week's results go out. No need to email.</div>
        <div>
          <b>Haven't paid yet?</b> Entry is {ENTRY_FEE_LABEL}:{' '}
          <a
            href={LEAGUESAFE_JOIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#4B3621] text-white font-bold text-[13px] rounded-lg px-3.5 py-1.5 no-underline hover:bg-[#3a2a19]"
          >
            Pay on LeagueSafe →
          </a>
        </div>
        <div className="text-[13px]">
          Paid a while ago and still seeing this? Your receipt may be under a different email —{' '}
          {profileLink('add it on your profile')} and we'll match you automatically. It's listed in{' '}
          <a href={LEAGUESAFE_ACCOUNT_URL} target="_blank" rel="noopener noreferrer" className="underline font-semibold text-pigskin-700">
            your LeagueSafe account settings
          </a>.
        </div>
      </div>
    )
  }

  // 1C — no entry found at all.
  return (
    <div className="rounded-lg border border-[#f2c9d1] bg-[#fbe9ec] px-5 py-4 text-sm text-charcoal-700 space-y-2">
      <div className="font-bold text-[#d1495b]">
        ⚠️ We don't see a {season} entry for this account{syncedAt && <span className="font-normal"> in the register{asOf}</span>}
      </div>
      <div><b>First: submit your picks.</b> They count and will attach to your entry once payments are reconciled — we import the register by hand, and expect updates before next week's results.</div>
      <div>
        <b>If LeagueSafe shows you paid, don't sweat this.</b> Your entry is just under an email we don't know —{' '}
        {profileLink('add that email on your profile')} and it links up automatically. It's listed in{' '}
        <a href={LEAGUESAFE_ACCOUNT_URL} target="_blank" rel="noopener noreferrer" className="underline font-semibold text-pigskin-700">
          your LeagueSafe account settings
        </a>.
      </div>
      <div>
        <b>New this year / haven't paid?</b>{' '}
        <a href={LEAGUESAFE_JOIN_URL} target="_blank" rel="noopener noreferrer" className="underline font-semibold text-pigskin-700">
          Join on LeagueSafe
        </a>{' '}— {ENTRY_FEE_LABEL}.
      </div>
    </div>
  )
}
