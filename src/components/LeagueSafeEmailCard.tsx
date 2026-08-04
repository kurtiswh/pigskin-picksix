import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EmailClaimService, LinkedEmail, MyPaymentStatus } from '@/services/emailClaimService'
import { ADMIN_EMAIL, ENTRY_FEE, LEAGUESAFE_ACCOUNT_URL, LEAGUESAFE_JOIN_URL, LEAGUESAFE_PAY_URL } from '@/lib/league'

interface Props {
  accountEmail: string
  activeSeason: number
  /** Called after something changes so the parent can refresh the auth context. */
  onLinked?: () => void
}

/**
 * "The email I used on LeagueSafe isn't the one I log in with."
 *
 * The player types that address and it goes on their profile immediately — that
 * is what people actually do, and it's what makes pick submission recognize
 * them (see lookup_player_by_email, migration 191).
 *
 * Adding an address does NOT move money: payments are attached to the account
 * only after the address is confirmed by an emailed code or linked by an admin.
 *
 * Matching already done in the past — an account merge, the LeagueSafe import,
 * an admin edit — shows up here on its own and reads as settled. The claim flow
 * is only for addresses we don't already know about.
 */
export default function LeagueSafeEmailCard({ accountEmail, activeSeason, onLinked }: Props) {
  const [emails, setEmails] = useState<LinkedEmail[]>([])
  const [status, setStatus] = useState<MyPaymentStatus | null>(null)

  const [newEmail, setNewEmail] = useState('')
  const [codeFor, setCodeFor] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [success, setSuccess] = useState('')

  const refresh = useCallback(async () => {
    setEmails(await EmailClaimService.getLinkedEmails())
    try {
      setStatus(await EmailClaimService.myPaymentStatus(activeSeason))
    } catch (err: any) {
      console.warn('Could not load payment status:', err?.message)
    }
  }, [activeSeason])

  useEffect(() => { refresh() }, [refresh])

  const clearMessages = () => { setError(''); setNotice(''); setSuccess('') }

  const handleAdd = async () => {
    setBusy(true)
    clearMessages()
    try {
      const result = await EmailClaimService.addLeagueSafeEmail(newEmail)
      switch (result.status) {
        case 'added': {
          setNewEmail('')
          await refresh()
          // Tell them straight away whether it actually found their entry.
          const lookup = await EmailClaimService.lookupByEmail(result.email!, activeSeason)
          setSuccess(
            lookup.paid
              ? `Added ${result.email} — we found your ${activeSeason} payment under it. You're good to submit picks.`
              : `Added ${result.email}. We'll match any payment made under it.`
          )
          onLinked?.()
          break
        }
        case 'already_added':
          setError('That address is already on your profile.')
          break
        case 'own_email':
          setError('That\'s already your sign-in email — nothing to add.')
          break
        case 'invalid_email':
          setError('That doesn\'t look like a valid email address.')
          break
        case 'blocked':
          setError(`That address belongs to another active account. Email ${ADMIN_EMAIL} and we'll sort it out.`)
          break
        case 'claimed_by_other':
          setError(`Another player already has that address on their profile. Email ${ADMIN_EMAIL}.`)
          break
        default:
          setError('Something went wrong. Please try again.')
      }
    } catch (err: any) {
      setError(err?.message || 'Could not add that address.')
    } finally {
      setBusy(false)
    }
  }

  const handleSendCode = async (email: string) => {
    setBusy(true)
    clearMessages()
    try {
      const result = await EmailClaimService.requestClaim(email)
      switch (result.status) {
        case 'sent':
          setCodeFor(email)
          setNotice(`We sent a 6-digit code to ${email}. It expires in 15 minutes.`)
          break
        case 'not_enabled':
          setNotice(
            `Email confirmation isn't switched on yet — no problem. Your address is saved, and ` +
            `the commissioner will match your payment to it.`
          )
          break
        case 'already_linked':
          setNotice('That address is already confirmed.')
          break
        case 'blocked':
          setError(`That address belongs to another active account. Email ${ADMIN_EMAIL}.`)
          break
        case 'rate_limited':
          setError('Too many code requests. Try again in an hour.')
          break
        default:
          setError('Could not send a confirmation code.')
      }
    } catch (err: any) {
      setError(err?.message || 'Could not send a confirmation code.')
    } finally {
      setBusy(false)
    }
  }

  const handleVerify = async () => {
    if (!codeFor) return
    setBusy(true)
    setError('')
    try {
      const result = await EmailClaimService.verifyClaim(codeFor, code)
      switch (result.status) {
        case 'verified': {
          const parts = [`${result.email} is confirmed.`]
          if (result.payments_linked) {
            const seasons = (result.seasons || []).join(', ')
            parts.push(`Matched ${result.payments_linked} payment${result.payments_linked === 1 ? '' : 's'}${seasons ? ` (${seasons})` : ''}.`)
          }
          if (result.merge_result?.picks_merged) {
            parts.push(`Pulled in ${result.merge_result.picks_merged} picks from your older record.`)
          }
          if (result.season_conflicts?.length) {
            parts.push(`Left ${result.season_conflicts.join(', ')} alone — this account already had a payment those seasons.`)
          }
          setSuccess(parts.join(' '))
          setNotice('')
          setCodeFor(null)
          setCode('')
          await refresh()
          onLinked?.()
          break
        }
        case 'bad_code':
          setError(`That code didn't match.${result.attempts_left ? ` ${result.attempts_left} attempts left.` : ''}`)
          break
        case 'expired':
          setError('That code expired. Send a new one.')
          setCodeFor(null)
          break
        case 'no_pending':
          setError('No code is outstanding for that address.')
          setCodeFor(null)
          break
        case 'too_many_attempts':
          setError('Too many wrong codes. Start over with a new one.')
          setCodeFor(null)
          break
        case 'blocked':
          setError(`That address now belongs to an active account. Email ${ADMIN_EMAIL}.`)
          setCodeFor(null)
          break
        default:
          setError('Something went wrong. Please try again.')
      }
    } catch (err: any) {
      setError(err?.message || 'Could not confirm that code.')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (email: LinkedEmail) => {
    if (!window.confirm(`Remove ${email.email} from your profile?`)) return
    try {
      await EmailClaimService.removeEmail(email.id)
      await refresh()
    } catch (err: any) {
      setError(err?.message || 'Could not remove that address.')
    }
  }

  const extraEmails = emails.filter(e => e.email.toLowerCase() !== accountEmail.toLowerCase())

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-[#4B3621]">LeagueSafe &amp; Payment</h3>
          <p className="text-xs text-charcoal-500">
            Entry fees run through LeagueSafe — {activeSeason} season
          </p>
        </div>
        {status?.found
          ? <Badge className={status.paid
              ? 'bg-[#e6f4ea] text-[#1f7a44] border border-[#bfe3cc]'
              : 'bg-[#fff5e2] text-[#b06a1a] border border-[#f0dcb0]'}>
              {status.paid ? `✅ ${activeSeason} entry paid` : `⏳ ${status.payment_status}`}
            </Badge>
          : <Badge className="bg-[#fbe9ec] text-[#d1495b] border border-[#f2c9d1]">
              ⚠️ No {activeSeason} payment found
            </Badge>}
      </div>

      {status?.found && status.paid && !status.linked && (
        <div className="rounded-lg border border-[#f0dcb0] bg-[#fff8ea] p-3 text-sm text-charcoal-700">
          We can see your {activeSeason} payment under <b>{status.matched_email}</b>, but it isn't
          attached to this account yet — the commissioner will finish the match, and you're clear to
          submit picks in the meantime.
        </div>
      )}

      <div className="rounded-lg border border-[#e7e2da] bg-[#faf8f4] p-4 text-sm text-charcoal-700">
        <p className="font-semibold text-[#4B3621] mb-1">Paid under a different email?</p>
        <p>
          We match payments by email address. Add the address you used on LeagueSafe and your picks,
          payment, and history will all line up with this account — no matter which one you use.
        </p>
        <p className="mt-2">
          Not sure which one that is? Check{' '}
          <a
            href={LEAGUESAFE_ACCOUNT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-semibold text-pigskin-700"
          >
            your LeagueSafe account settings
          </a>{' '}
          — LeagueSafe accounts live in the FanBall wallet.
        </p>
      </div>

      {/* Addresses on this account */}
      <div className="space-y-2">
        <Label>Email addresses on your profile</Label>
        <div className="rounded-lg border border-[#e7e2da] divide-y divide-[#e7e2da]">
          <div className="flex items-center justify-between gap-2 p-3">
            <span className="text-sm font-medium text-charcoal-800 truncate">{accountEmail}</span>
            <Badge className="bg-[#eef2f7] text-[#41506b] border border-[#dbe3ee] shrink-0">Sign-in</Badge>
          </div>
          {extraEmails.map(e => (
            <div key={e.id} className="flex items-center justify-between gap-2 p-3 flex-wrap">
              <div className="min-w-0">
                <div className="text-sm text-charcoal-800 truncate">{e.email}</div>
                {e.is_matched && e.seasons?.length > 0 && (
                  <div className="text-xs text-charcoal-500">
                    Counts your {e.seasons.join(', ')} entr{e.seasons.length === 1 ? 'y' : 'ies'}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Matching that's already been done — by a past merge, the
                    import, or an admin — is settled. Don't ask them to confirm
                    an address that already works. */}
                {e.is_matched
                  ? <Badge className="bg-[#e6f4ea] text-[#1f7a44] border border-[#bfe3cc]">Matched</Badge>
                  : e.verified_at
                    ? <Badge className="bg-[#e6f4ea] text-[#1f7a44] border border-[#bfe3cc]">Confirmed</Badge>
                    : <Badge className="bg-[#fff5e2] text-[#b06a1a] border border-[#f0dcb0]">Pending</Badge>}
                {!e.is_matched && !e.verified_at && (
                  <button
                    type="button"
                    onClick={() => handleSendCode(e.email)}
                    disabled={busy}
                    className="text-xs text-pigskin-700 underline hover:text-pigskin-900"
                  >
                    Confirm it's mine
                  </button>
                )}
                {e.can_remove && (
                  <button
                    type="button"
                    onClick={() => handleRemove(e)}
                    className="text-xs text-charcoal-500 underline hover:text-[#d1495b]"
                  >
                    Remove
                  </button>
                )}
              </div>

              {codeFor === e.email && (
                <div className="w-full flex gap-2 pt-2">
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ''))}
                    placeholder="6-digit code"
                    disabled={busy}
                    className="max-w-[160px]"
                  />
                  <Button type="button" onClick={handleVerify} disabled={busy || code.length !== 6}>
                    {busy ? 'Confirming…' : 'Confirm'}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-[#fbe9ec] border border-[#f2c9d1] text-[#d1495b] px-4 py-3 text-sm">{error}</div>
      )}
      {notice && !error && (
        <div className="rounded-lg bg-[#eef4fb] border border-[#cfe0f2] text-[#2c5a86] px-4 py-3 text-sm">{notice}</div>
      )}
      {success && (
        <div className="rounded-lg bg-[#e6f4ea] border border-[#bfe3cc] text-[#1f7a44] px-4 py-3 text-sm">✅ {success}</div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="new-leaguesafe-email">Add your LeagueSafe email</Label>
          <div className="flex gap-2">
            <Input
              id="new-leaguesafe-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="the-address-you-paid-with@example.com"
              disabled={busy}
            />
            <Button type="button" onClick={handleAdd} disabled={busy || newEmail.trim() === ''}>
              {busy ? 'Adding…' : 'Add'}
            </Button>
          </div>
          <p className="text-xs text-charcoal-500">
            Something look wrong? Email{' '}
            <a href={`mailto:${ADMIN_EMAIL}`} className="underline">{ADMIN_EMAIL}</a>.
          </p>
        </div>

        {!status?.found && (
          <div className="space-y-2">
            <Label>Haven't paid your ${ENTRY_FEE} entry?</Label>
            <a href={LEAGUESAFE_JOIN_URL} target="_blank" rel="noopener noreferrer" className="block">
              <Button type="button" className="w-full">Join &amp; pay on LeagueSafe</Button>
            </a>
            <a href={LEAGUESAFE_PAY_URL} target="_blank" rel="noopener noreferrer" className="block">
              <Button type="button" variant="outline" className="w-full">
                Already in the league? Pay here
              </Button>
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
