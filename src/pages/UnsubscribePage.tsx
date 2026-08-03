import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Layout from '@/components/Layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

/**
 * Public one-click unsubscribe — no login, token only.
 *
 * The opt-out is applied on a button press rather than on page load: mail
 * clients and security scanners pre-fetch links, and a GET side effect would
 * unsubscribe people who never clicked anything.
 */

interface Status { email: string; display_name: string; subscribed: boolean }

export default function UnsubscribePage() {
  const [params] = useSearchParams()
  const token = params.get('t') || ''
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setError('This link is missing its unsubscribe code.'); setLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const { data, error: e } = await supabase.rpc('unsubscribe_status', { p_token: token })
        if (cancelled) return
        if (e) throw e
        const row = (data as Status[])?.[0]
        if (!row) setError("We couldn't find that unsubscribe link. It may have been changed or already used.")
        else setStatus(row)
      } catch {
        if (!cancelled) setError('Something went wrong loading your email settings. Please try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  const run = async (fn: 'unsubscribe_by_token' | 'resubscribe_by_token') => {
    setWorking(true); setError('')
    try {
      const { data, error: e } = await supabase.rpc(fn, { p_token: token })
      if (e) throw e
      const row = (data as Status[])?.[0]
      if (row) setStatus(row)
    } catch {
      setError('That did not save. Please try again, or email admin@pigskinpicksix.com and we will take care of it.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-xl">
        <Card>
          <CardContent className="pt-6 text-center">
            {loading ? (
              <div className="py-8 text-charcoal-500">Loading…</div>
            ) : error ? (
              <>
                <div className="text-4xl mb-3">🤔</div>
                <h1 className="text-xl font-bold text-pigskin-900 mb-2">We hit a snag</h1>
                <p className="text-sm text-charcoal-600 mb-4">{error}</p>
                <p className="text-sm text-charcoal-600">
                  Email <a href="mailto:admin@pigskinpicksix.com" className="underline font-semibold text-pigskin-700">admin@pigskinpicksix.com</a>{' '}
                  and we'll remove you by hand.
                </p>
              </>
            ) : status?.subscribed ? (
              <>
                <div className="text-4xl mb-3">📬</div>
                <h1 className="text-2xl font-bold text-pigskin-900 mb-2">Unsubscribe from Pigskin Pick Six?</h1>
                <p className="text-sm text-charcoal-600 mb-1">
                  This stops <b>all</b> emails to <b>{status.email}</b> — signup notices, weekly pick reminders,
                  and results recaps.
                </p>
                <p className="text-xs text-charcoal-500 mb-6">
                  If you sign up to play later, you'll start receiving them again.
                </p>
                <Button
                  onClick={() => run('unsubscribe_by_token')}
                  disabled={working}
                  className="bg-pigskin-600 hover:bg-pigskin-700 text-white w-full sm:w-auto"
                >
                  {working ? 'Unsubscribing…' : 'Yes, unsubscribe me'}
                </Button>
                <div className="mt-5 pt-4 border-t border-[#ece7de]">
                  <Link to="/" className="text-sm underline text-charcoal-500 hover:text-pigskin-700">
                    Never mind — take me to the site
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="text-4xl mb-3">✅</div>
                <h1 className="text-2xl font-bold text-pigskin-900 mb-2">You're unsubscribed</h1>
                <p className="text-sm text-charcoal-600 mb-6">
                  We won't email <b>{status?.email}</b> again. Sorry to see you go — the pot will miss you.
                </p>
                <Button onClick={() => run('resubscribe_by_token')} disabled={working} variant="outline">
                  {working ? 'Working…' : 'Actually, resubscribe me'}
                </Button>
                <div className="mt-5 pt-4 border-t border-[#ece7de]">
                  <Link to="/rules" className="text-sm underline text-charcoal-500 hover:text-pigskin-700">
                    Read the rules
                  </Link>
                  <span className="text-charcoal-300 mx-2">·</span>
                  <Link to="/history" className="text-sm underline text-charcoal-500 hover:text-pigskin-700">
                    Hall of Champions
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
