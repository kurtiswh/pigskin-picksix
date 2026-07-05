import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { EmailService } from '@/services/emailService'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'

/**
 * Preseason signup email sequence (Part B feature).
 * Admins define "touches" (subject + rich body + send time). The DB cron enqueues
 * a personalized copy to every email in the system when a touch is due and sends
 * it in throttled batches. This screen manages the touches + a test send.
 */

interface Touch {
  id: string
  season: number
  label: string | null
  subject: string
  body_html: string
  send_at: string
  status: string
  recipients_count: number | null
  enqueued_at: string | null
}

interface Props { season: number }

const defaultBody = (season: number) => `<p>Hey {{name}},</p>
<p>Pigskin Pick Six is back for the ${season} season — here's how to get in:</p>
<ul>
  <li><strong>Pay your entry on LeagueSafe:</strong> <a href="YOUR_LEAGUESAFE_LINK">join &amp; pay here</a></li>
  <li><strong>Register / log in:</strong> <a href="https://pigskinpicksix.com">pigskinpicksix.com</a></li>
  <li><strong>Share your LeagueSafe payment ID / email</strong> so we can match your payment — just reply to this email.</li>
</ul>
<p>See you on the gridiron. 🏈</p>`

// datetime-local <-> ISO helpers
const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}
const fromLocalInput = (v: string) => new Date(v).toISOString()

export default function PreseasonSequence({ season }: Props) {
  const { user } = useAuth()
  const [touches, setTouches] = useState<Touch[]>([])
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // editor form
  const [editingId, setEditingId] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState(defaultBody(season))
  const [sendAt, setSendAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data, error: e } = await supabase.from('preseason_emails')
        .select('*').eq('season', season).order('send_at', { ascending: true })
      if (e) throw e
      setTouches((data as Touch[]) || [])
      const { count } = await supabase.from('users').select('id', { count: 'exact', head: true })
        .not('email', 'is', null)
      setRecipientCount(count ?? null)
    } catch (err: any) { setError(err?.message || 'Failed to load') } finally { setLoading(false) }
  }, [season])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (user?.email) setTestEmail(user.email) }, [user?.email])

  const resetForm = () => {
    setEditingId(null); setLabel(''); setSubject(''); setBody(defaultBody(season)); setSendAt(''); setMsg('')
  }

  const editTouch = (t: Touch) => {
    setEditingId(t.id); setLabel(t.label || ''); setSubject(t.subject); setBody(t.body_html)
    setSendAt(toLocalInput(t.send_at)); setMsg('')
  }

  const save = async () => {
    if (!subject.trim() || !body.trim() || !sendAt) { setMsg('Subject, body, and send time are required.'); return }
    setSaving(true); setMsg('')
    try {
      const row = { season, label: label.trim() || null, subject: subject.trim(), body_html: body, send_at: fromLocalInput(sendAt), status: 'scheduled' }
      const { error: e } = editingId
        ? await supabase.from('preseason_emails').update({ ...row, updated_at: new Date().toISOString() }).eq('id', editingId)
        : await supabase.from('preseason_emails').insert(row)
      if (e) throw e
      resetForm(); await load()
    } catch (err: any) { setMsg(`❌ ${err?.message || 'Save failed'}`) } finally { setSaving(false) }
  }

  const cancelTouch = async (t: Touch) => {
    if (!confirm(`Cancel "${t.label || t.subject}"? It won't be sent.`)) return
    await supabase.from('preseason_emails').update({ status: 'canceled', updated_at: new Date().toISOString() }).eq('id', t.id)
    await load()
  }
  const deleteTouch = async (t: Touch) => {
    if (!confirm(`Delete "${t.label || t.subject}"?`)) return
    await supabase.from('preseason_emails').delete().eq('id', t.id)
    await load()
  }

  const sendTest = async () => {
    if (!subject.trim() || !body.trim()) { setMsg('Add a subject and body first.'); return }
    setTestSending(true); setMsg('')
    try {
      const html = body.replace(/\{\{name\}\}/g, user?.display_name || 'there')
      const ok = await EmailService.sendEmailDirect(testEmail.trim(), `[TEST] ${subject}`, html, html.replace(/<[^>]*>/g, ''))
      setMsg(ok ? `✅ Test sent to ${testEmail}` : '❌ Test failed to send')
    } catch (err: any) { setMsg(`❌ ${err?.message || 'Test failed'}`) } finally { setTestSending(false) }
  }

  const statusPill = (t: Touch) => {
    const map: Record<string, string> = {
      scheduled: 'bg-blue-100 text-blue-800', enqueued: 'bg-green-100 text-green-800', canceled: 'bg-charcoal-100 text-charcoal-500',
    }
    return <span className={`text-xs font-bold px-2 py-1 rounded-full ${map[t.status] || 'bg-charcoal-100'}`}>{t.status}</span>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">📣 Preseason Signup Sequence — {season}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-charcoal-600">
          Scheduled emails to <b>every email in the system{recipientCount != null ? ` (~${recipientCount})` : ''}</b> to drive signups.
          A touch sends automatically once its send time passes (checked every ~10 min). Use <code>{'{{name}}'}</code> for the recipient's name.
        </p>
        {error && <div className="text-sm text-red-700">⚠️ {error}</div>}

        {/* Scheduled touches */}
        <div className="space-y-2">
          {loading ? <div className="text-sm text-charcoal-500">Loading…</div>
            : touches.length === 0 ? <div className="text-sm text-charcoal-400">No touches scheduled yet.</div>
            : touches.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-3 border border-charcoal-100 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium text-charcoal-900 truncate">{t.label || t.subject}</div>
                  <div className="text-xs text-charcoal-500">
                    {new Date(t.send_at).toLocaleString()} · {t.subject}
                    {t.status === 'enqueued' && t.recipients_count != null ? ` · sent to ${t.recipients_count}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {statusPill(t)}
                  {t.status === 'scheduled' && <>
                    <Button size="sm" variant="outline" onClick={() => editTouch(t)}>Edit</Button>
                    <Button size="sm" variant="outline" className="text-amber-700" onClick={() => cancelTouch(t)}>Cancel</Button>
                  </>}
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => deleteTouch(t)}>Delete</Button>
                </div>
              </div>
            ))}
        </div>

        {/* Editor */}
        <div className="border-t border-charcoal-100 pt-4 space-y-3">
          <div className="font-medium text-pigskin-900">{editingId ? 'Edit touch' : 'New touch'}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-charcoal-700">Label (internal)</label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Announcement / 3-week reminder" />
            </div>
            <div>
              <label className="text-xs font-medium text-charcoal-700">Send at</label>
              <Input type="datetime-local" value={sendAt} onChange={e => setSendAt(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-charcoal-700">Subject</label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Pigskin Pick Six is back — sign up!" />
          </div>
          <div>
            <label className="text-xs font-medium text-charcoal-700">Body</label>
            <ReactQuill theme="snow" value={body} onChange={setBody} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={save} disabled={saving} className="bg-pigskin-600 hover:bg-pigskin-700 text-white">
              {saving ? 'Saving…' : editingId ? 'Update touch' : 'Schedule touch'}
            </Button>
            {editingId && <Button variant="outline" onClick={resetForm}>Cancel edit</Button>}
            <span className="mx-2 text-charcoal-300">|</span>
            <Input value={testEmail} onChange={e => setTestEmail(e.target.value)} className="w-56 h-9" />
            <Button variant="outline" onClick={sendTest} disabled={testSending || !testEmail.trim()}>
              {testSending ? 'Sending…' : 'Send test'}
            </Button>
          </div>
          {msg && <div className="text-sm">{msg}</div>}
        </div>
      </CardContent>
    </Card>
  )
}
