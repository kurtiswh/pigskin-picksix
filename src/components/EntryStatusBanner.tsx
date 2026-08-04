import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmailClaimService, MyPaymentStatus } from '@/services/emailClaimService'

interface Props {
  season: number
}

/**
 * "Am I actually in this thing?" — shown above the pick sheet.
 *
 * Resolves the payment across EVERY email on the player's profile (sign-in,
 * LeagueSafe, or any address they've added), which is the whole point: people
 * pay under one address and submit picks under another. Silent when the entry
 * is paid and attached, because that's the boring case.
 */
export default function EntryStatusBanner({ season }: Props) {
  const [status, setStatus] = useState<MyPaymentStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    EmailClaimService.myPaymentStatus(season)
      .then(result => { if (!cancelled) setStatus(result) })
      .catch(err => console.warn('Could not load entry status:', err?.message))
    return () => { cancelled = true }
  }, [season])

  if (!status) return null

  // Paid and attached to this account — nothing to say.
  if (status.found && status.paid && status.linked) return null

  if (status.found && status.paid && !status.linked) {
    return (
      <div className="rounded-lg border border-[#f0dcb0] bg-[#fff8ea] px-5 py-4 text-sm text-charcoal-700">
        <div className="font-bold text-[#4B3621] mb-1">✅ Entry found — you're good to submit</div>
        We matched your {season} payment to <b>{status.matched_email}</b>. It's still being attached
        to this account, so give it a day before you worry about the leaderboard.
      </div>
    )
  }

  if (status.found && !status.paid) {
    return (
      <div className="rounded-lg border border-[#f0dcb0] bg-[#fff8ea] px-5 py-4 text-sm text-charcoal-700">
        <div className="font-bold text-[#4B3621] mb-1">⏳ Entry {status.payment_status}</div>
        Your {season} entry isn't showing as paid yet. Picks you submit will still count once it
        clears — check your{' '}
        <Link to="/profile" className="underline font-semibold text-pigskin-700">profile</Link>.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[#f2c9d1] bg-[#fbe9ec] px-5 py-4 text-sm text-charcoal-700">
      <div className="font-bold text-[#d1495b] mb-1">⚠️ We can't find your {season} entry</div>
      Go ahead and make your picks — but if you paid on LeagueSafe under a different email address,
      add it on your{' '}
      <Link to="/profile" className="underline font-semibold text-pigskin-700">profile page</Link>{' '}
      so your entry lines up with your picks.
    </div>
  )
}
