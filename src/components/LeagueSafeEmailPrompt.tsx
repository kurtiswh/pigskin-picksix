import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentSeason } from '@/hooks/useCurrentSeason'
import { EmailClaimService } from '@/services/emailClaimService'
import { ADMIN_EMAIL, ENTRY_FEE, LEAGUESAFE_ACCOUNT_URL } from '@/lib/league'

/**
 * "Which email did you use on LeagueSafe?" — asked once, after sign-in, of the
 * only people it applies to.
 *
 * The register page used to carry this. It couldn't work there: the player has
 * no account yet, add_my_leaguesafe_email is granted to authenticated only, and
 * we'd have taken the address and gone silent about whether it helped. Here we
 * can record it and tell them straight away whether it found their entry.
 *
 * For a new registrant this IS part of registration — signUp's emailRedirectTo
 * sends them from the confirmation link to /login?confirmed=true, which
 * redirects to / with a session. This is the next screen they see.
 *
 * Two weights:
 *   full  — never answered. A modal that blocks the page until they pick one of
 *           the three answers. Skipping is an answer.
 *   quiet — skipped before. An inline banner, because blocking someone who has
 *           already said "not now" every time they sign in is just nagging.
 *
 * Nobody with a matched payment sees either.
 */

const dismissKey = (userId: string) => `pp6.leaguesafe-prompt-dismissed.${userId}`

export default function LeagueSafeEmailPrompt() {
  const { user, refreshUser } = useAuth()
  const { activeSeason } = useCurrentSeason()

  const [needed, setNeeded] = useState(false)
  const [weight, setWeight] = useState<'full' | 'quiet'>('full')
  const [hidden, setHidden] = useState(false)

  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)

  const check = useCallback(async () => {
    if (!user) return

    // They've already told us they paid under this address — never ask again.
    if (user.leaguesafe_email_confirmed_at) {
      setNeeded(false)
      return
    }

    try {
      const status = await EmailClaimService.myPaymentStatus(activeSeason)
      // A linked payment means matching already worked. Anything else — no
      // payment found, or one found but not attached — is worth asking about.
      setNeeded(!status.linked)
    } catch (err) {
      // Never let this block the page it sits on.
      console.warn('Could not check payment status for the LeagueSafe prompt:', err)
      setNeeded(false)
    }
  }, [user, activeSeason])

  useEffect(() => {
    check()
  }, [check])

  useEffect(() => {
    if (!user) return
    try {
      setWeight(localStorage.getItem(dismissKey(user.id)) ? 'quiet' : 'full')
    } catch {
      // Private browsing with storage disabled — treat as never dismissed.
      setWeight('full')
    }
  }, [user])

  const open = Boolean(user && needed && !hidden)
  const asModal = open && weight === 'full'

  // Hold the page still behind the modal, and put them in the field they're
  // being asked to fill.
  useEffect(() => {
    if (!asModal) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    inputRef.current?.focus()
    return () => {
      document.body.style.overflow = previous
    }
  }, [asModal])

  // Escape closes it the same way "Skip for now" does. A modal with no keyboard
  // exit traps anyone not using a mouse, and skipping is a real answer anyway.
  useEffect(() => {
    if (!asModal || busy || done) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissPrompt()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asModal, busy, done])

  function dismissPrompt() {
    if (!user) return
    try {
      localStorage.setItem(dismissKey(user.id), String(Date.now()))
    } catch {
      // Nothing to do — they'll get the full weight again next time.
    }
    setHidden(true)
  }

  if (!user || !open) return null

  /** Their sign-in address is the LeagueSafe one. Recorded, not just dismissed. */
  const confirmSameEmail = async () => {
    setBusy(true)
    setError('')
    try {
      await EmailClaimService.confirmLeagueSafeEmailIsSignIn()
      setDone(`Thanks — we'll look for your ${activeSeason} entry under ${user.email}.`)
      await refreshUser()
    } catch (err: any) {
      console.error('Could not confirm LeagueSafe email:', err)
      setError("We couldn't save that. Try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  const addEmail = async () => {
    const target = email.trim()
    if (!target) {
      setError('Enter the email you used on LeagueSafe.')
      return
    }

    setBusy(true)
    setError('')

    try {
      const result = await EmailClaimService.addLeagueSafeEmail(target)

      switch (result.status) {
        case 'added': {
          // Tell them straight away whether it actually found the entry — the
          // whole reason for asking here rather than at registration.
          const lookup = await EmailClaimService.lookupByEmail(result.email!, activeSeason)
          setDone(
            lookup.paid
              ? `Added ${result.email} — we found your ${activeSeason} entry under it. You're all set.`
              : `Added ${result.email}. We'll connect any payment made under it.`
          )
          await refreshUser()
          break
        }
        case 'own_email':
          // They typed the address they sign in with. That's an answer, not an
          // error — record it the same way the button does.
          await confirmSameEmail()
          break
        case 'already_added':
          setError("That address is already on your profile — we'll match it when your payment lands.")
          break
        case 'invalid_email':
          setError("That doesn't look like an email address.")
          break
        case 'blocked':
          setError(`That address belongs to another active account. Email ${ADMIN_EMAIL} and we'll sort it out.`)
          break
        case 'claimed_by_other':
          setError(`Another player already has that address on their profile. Email ${ADMIN_EMAIL}.`)
          break
        default:
          setError("We couldn't add that address. Try again in a moment.")
      }
    } catch (err: any) {
      console.error('Could not add LeagueSafe email:', err)
      setError("We couldn't add that address. Try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  const isFull = weight === 'full'

  // ── Answered ────────────────────────────────────────────────────────────
  // Worth reading — it's the only place we say whether their entry was found —
  // so in the modal it stays put behind an explicit Done rather than vanishing.
  if (done) {
    const confirmation = (
      <div className="px-4 py-3 rounded-lg text-sm bg-[#e6f4ea] border border-[#bfe3cc] text-[#1f7a44]">
        ✅ {done}
      </div>
    )

    if (!isFull) {
      return <div className="container mx-auto px-4 pt-4">{confirmation}</div>
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="w-full max-w-lg bg-white rounded-xl shadow-xl p-6 space-y-4">
          {confirmation}
          <Button
            type="button"
            onClick={() => setHidden(true)}
            className="w-full bg-[#4B3621] text-white hover:bg-[#3a2a19]"
          >
            Done
          </Button>
        </div>
      </div>
    )
  }

  // ── The ask ─────────────────────────────────────────────────────────────
  const body = (
    <div className="text-charcoal-700 text-sm space-y-3">
      {isFull ? (
        <>
          <h2 id="leaguesafe-prompt-title" className="font-semibold text-[#4B3621] text-lg">
            One last thing — which email did you use on LeagueSafe?
          </h2>
          <p>
            We connect your ${ENTRY_FEE} entry to your account by email address. If you paid under a
            different address than <strong>{user.email}</strong>, tell us which one.
          </p>
        </>
      ) : (
        <p>
          <strong className="text-[#4B3621]">We don't have your LeagueSafe email.</strong> We connect
          entries to accounts by email address, and we haven't found a {activeSeason} payment under yours.
        </p>
      )}

      <Input
        ref={inputRef}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="name@example.com"
        disabled={busy}
      />

      {error && <p className="text-[#d1495b]">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={addEmail}
          disabled={busy}
          className="bg-[#C9A04E] text-pigskin-900 font-bold hover:bg-[#b78e3f]"
        >
          {busy ? 'Saving...' : isFull ? 'Add this email' : 'Add it'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-[#e7e2da]"
          onClick={confirmSameEmail}
          disabled={busy}
        >
          I used this same email
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-[#e7e2da]"
          onClick={dismissPrompt}
          disabled={busy}
        >
          {isFull ? 'Skip for now' : 'Not now'}
        </Button>
      </div>

      <p className="text-xs text-charcoal-500">
        Don't know which one you used?{' '}
        <a
          href={LEAGUESAFE_ACCOUNT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-semibold text-pigskin-700"
        >
          See it on your LeagueSafe account.
        </a>
      </p>
    </div>
  )

  if (!isFull) {
    return (
      <div className="container mx-auto px-4 pt-4">
        <div className="p-4 rounded-lg bg-[#faf8f4] border border-[#e7e2da]">{body}</div>
      </div>
    )
  }

  // No click-outside dismissal: one of the three buttons (or Escape, which is
  // the same as skipping) has to be the way out.
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="leaguesafe-prompt-title"
    >
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl p-6 border-t-4 border-[#C9A04E]">
        {body}
      </div>
    </div>
  )
}
