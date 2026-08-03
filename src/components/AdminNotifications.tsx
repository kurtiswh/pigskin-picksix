import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NotificationScheduler } from '@/services/notificationScheduler'
import { AdminEmailSettingsService, AdminEmailSettings, ReminderSetting } from '@/services/adminEmailSettings'
import { supabase } from '@/lib/supabase'
import '@/utils/emailTesting' // Load testing utilities for console access

/**
 * Email Center — the single place to see and control every email the platform
 * sends. Top card is the source of truth for "what sends, to whom, when";
 * the cards below configure the pieces that are configurable. The Preseason
 * Signup Sequence card (rendered after this component on the Notifications
 * tab) manages the offseason drip.
 */

interface AdminNotificationsProps {
  currentWeek: number
  currentSeason: number
}

interface QueueStats {
  pending: number
  sent7d: number
  failed7d: number
}

const PILL_STYLES: Record<string, string> = {
  on: 'bg-green-100 text-green-800',
  off: 'bg-charcoal-100 text-charcoal-500',
  manual: 'bg-[#FBF3DC] text-[#8a6d1f]',
  always: 'bg-blue-100 text-blue-800',
}

function StatusPill({ kind, label }: { kind: keyof typeof PILL_STYLES; label: string }) {
  return <span className={`text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap ${PILL_STYLES[kind]}`}>{label}</span>
}

export default function AdminNotifications({ currentWeek, currentSeason }: AdminNotificationsProps) {
  const [loading, setLoading] = useState(false)
  const [processingEmails, setProcessingEmails] = useState(false)
  const [status, setStatus] = useState('')
  const [emailSettings, setEmailSettings] = useState<AdminEmailSettings | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [testEmail, setTestEmail] = useState('admin@pigskinpicksix.com')
  const [authError, setAuthError] = useState<string | null>(null)
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null)

  useEffect(() => {
    loadEmailSettings()
    loadQueueStats()
  }, [currentSeason]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadEmailSettings = async () => {
    try {
      setSettingsLoading(true)
      setAuthError(null)
      const settings = await AdminEmailSettingsService.getEmailSettings(currentSeason)
      setEmailSettings(settings)
    } catch (error) {
      console.error('Error loading email settings:', error)
      let errorMessage = (error as Error).message
      if (errorMessage.includes('row-level security policy')) {
        errorMessage = 'Permission denied. Please make sure you are logged in as an admin user.'
        setAuthError(errorMessage)
      } else if (errorMessage.includes('Auth session missing')) {
        errorMessage = 'Authentication required. Please log in to view email settings.'
        setAuthError(errorMessage)
      }
      setStatus('❌ Error loading email settings: ' + errorMessage)
    } finally {
      setSettingsLoading(false)
    }
  }

  const loadQueueStats = useCallback(async () => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const [pending, sent, failed] = await Promise.all([
        supabase.from('email_jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('email_jobs').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('updated_at', sevenDaysAgo),
        supabase.from('email_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('updated_at', sevenDaysAgo),
      ])
      setQueueStats({ pending: pending.count ?? 0, sent7d: sent.count ?? 0, failed7d: failed.count ?? 0 })
    } catch (error) {
      console.error('Error loading queue stats:', error)
    }
  }, [])

  const handleResendWeekOpening = async () => {
    if (!confirm(`Queue the "Week ${currentWeek} is open" announcement to ALL active players right now?`)) return
    try {
      setLoading(true)
      setStatus('Queueing week opening announcement...')
      // Deadline shown in the email: next Saturday 11 AM CT
      const now = new Date()
      const nextSaturday = new Date(now)
      const daysUntilSaturday = (6 - now.getDay() + 7) % 7 || 7
      nextSaturday.setDate(now.getDate() + daysUntilSaturday)
      nextSaturday.setHours(16, 0, 0, 0)

      await NotificationScheduler.onWeekOpened(currentWeek, currentSeason, nextSaturday)
      const result = await NotificationScheduler.processEmailQueue()
      setStatus(`✅ Week opening announcement sent — processed ${result.processed} emails (${result.errors} errors)`)
      loadQueueStats()
    } catch (error) {
      console.error('Error sending week opening announcement:', error)
      setStatus('❌ Error: ' + (error as Error).message)
    } finally {
      setLoading(false)
      setTimeout(() => setStatus(''), 8000)
    }
  }

  const handleProcessEmailQueue = async () => {
    try {
      setProcessingEmails(true)
      setStatus('Processing email queue...')
      const result = await NotificationScheduler.processEmailQueue()
      setStatus(`✅ Processed ${result.processed} emails, ${result.errors} errors`)
      loadQueueStats()
    } catch (error) {
      console.error('Error processing email queue:', error)
      setStatus('❌ Error processing emails: ' + (error as Error).message)
    } finally {
      setProcessingEmails(false)
      setTimeout(() => setStatus(''), 5000)
    }
  }

  const handleTestPickConfirmation = async () => {
    try {
      setLoading(true)
      setStatus('Sending test pick confirmation email...')
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('Must be authenticated to send test emails')

      const mockPicks = [
        { game: 'Georgia @ Alabama', pick: 'Alabama', spread: -3, isLock: true, lockTime: '2026-09-05T19:00:00.000Z' },
        { game: 'Michigan @ Ohio State', pick: 'Ohio State', spread: -7, isLock: false, lockTime: '2026-09-05T15:30:00.000Z' },
        { game: 'Texas @ Oklahoma', pick: 'Texas', spread: -2.5, isLock: false, lockTime: '2026-09-05T20:00:00.000Z' },
        { game: 'USC @ Oregon', pick: 'Oregon', spread: -6, isLock: false, lockTime: '2026-09-05T17:00:00.000Z' },
        { game: 'Notre Dame @ Navy', pick: 'Notre Dame', spread: -10, isLock: false, lockTime: '2026-09-05T16:00:00.000Z' },
        { game: 'Clemson @ Florida State', pick: 'Clemson', spread: 1, isLock: false, lockTime: '2026-09-05T18:00:00.000Z' },
      ]

      await NotificationScheduler.onPicksSubmitted(
        user.id,
        testEmail,
        'Test Admin',
        currentWeek,
        currentSeason,
        mockPicks
      )
      setStatus(`✅ Test pick confirmation sent to ${testEmail}`)
    } catch (error) {
      console.error('Error sending test email:', error)
      setStatus('❌ Error sending test email: ' + (error as Error).message)
    } finally {
      setLoading(false)
      setTimeout(() => setStatus(''), 5000)
    }
  }

  const handleUpdateReminderSettings = async () => {
    if (!emailSettings) return
    try {
      setLoading(true)
      setStatus('Updating reminder settings...')
      await AdminEmailSettingsService.updateReminderSchedule(currentSeason, emailSettings.reminder_schedule)
      setStatus('✅ Reminder settings updated successfully!')
      await loadEmailSettings()
    } catch (error) {
      console.error('Error updating reminder settings:', error)
      let errorMessage = (error as Error).message
      if (errorMessage.includes('row-level security policy')) {
        errorMessage = 'Permission denied. Please make sure you are logged in as an admin user.'
      }
      setStatus('❌ Error updating settings: ' + errorMessage)
    } finally {
      setLoading(false)
      setTimeout(() => setStatus(''), 3000)
    }
  }

  const handleUpdateOpenPicksSettings = async () => {
    if (!emailSettings) return
    try {
      setLoading(true)
      setStatus('Updating week opening settings...')
      await AdminEmailSettingsService.updateOpenPicksSettings(currentSeason, emailSettings.open_picks_notifications)
      setStatus('✅ Week opening settings updated successfully!')
      await loadEmailSettings()
    } catch (error) {
      console.error('Error updating open picks settings:', error)
      let errorMessage = (error as Error).message
      if (errorMessage.includes('row-level security policy')) {
        errorMessage = 'Permission denied. Please make sure you are logged in as an admin user.'
      }
      setStatus('❌ Error updating settings: ' + errorMessage)
    } finally {
      setLoading(false)
      setTimeout(() => setStatus(''), 3000)
    }
  }

  const updateReminderSetting = (index: number, updates: Partial<ReminderSetting>) => {
    if (!emailSettings) return
    const newReminders = [...emailSettings.reminder_schedule.reminders]
    newReminders[index] = { ...newReminders[index], ...updates }
    setEmailSettings({
      ...emailSettings,
      reminder_schedule: { ...emailSettings.reminder_schedule, reminders: newReminders },
    })
  }

  const addCustomReminder = () => {
    if (!emailSettings) return
    setEmailSettings({
      ...emailSettings,
      reminder_schedule: {
        ...emailSettings.reminder_schedule,
        reminders: [...emailSettings.reminder_schedule.reminders, { name: 'Custom Reminder', hours_before_deadline: 6, enabled: true }],
      },
    })
  }

  const removeReminder = (index: number) => {
    if (!emailSettings) return
    setEmailSettings({
      ...emailSettings,
      reminder_schedule: {
        ...emailSettings.reminder_schedule,
        reminders: emailSettings.reminder_schedule.reminders.filter((_, i) => i !== index),
      },
    })
  }

  if (settingsLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>📧 Email Center</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="w-6 h-6 border-2 border-pigskin-600 border-t-transparent rounded-full animate-spin mr-3"></div>
            Loading email settings...
          </div>
        </CardContent>
      </Card>
    )
  }

  // Overview rows derived from live settings
  const remindersOn = emailSettings?.reminder_schedule.enabled ?? false
  const enabledReminderHours = (emailSettings?.reminder_schedule.reminders || [])
    .filter(r => r.enabled)
    .map(r => r.hours_before_deadline)
    .sort((a, b) => b - a)
  const weekOpeningOn = emailSettings?.open_picks_notifications.enabled ?? false

  const overviewRows: Array<{ email: string; audience: string; when: string; control: string; pill: { kind: keyof typeof PILL_STYLES; label: string } }> = [
    {
      email: '📣 Preseason signup',
      audience: 'Every email in the system',
      when: 'At each scheduled touch (offseason drip)',
      control: 'Preseason Signup Sequence card below',
      pill: { kind: 'manual', label: 'Scheduled' },
    },
    {
      email: '🏈 Week opening',
      audience: 'All active players',
      when: "The moment you open a week's picks",
      control: 'Toggle below',
      pill: weekOpeningOn ? { kind: 'on', label: 'On' } : { kind: 'off', label: 'Off' },
    },
    {
      email: '⏰ Pick reminders',
      audience: "Players who haven't submitted",
      when: remindersOn && enabledReminderHours.length
        ? `${enabledReminderHours.map(h => `${h}h`).join(' · ')} before deadline (cron, every 15 min, 6am–11pm CT)`
        : 'Disabled',
      control: 'Reminder Schedule card below',
      pill: remindersOn && enabledReminderHours.length ? { kind: 'on', label: 'On' } : { kind: 'off', label: 'Off' },
    },
    {
      email: '✅ Pick confirmation',
      audience: 'The player who submitted',
      when: 'Instantly on submit',
      control: 'Always on',
      pill: { kind: 'always', label: 'Always' },
    },
    {
      email: '📊 Weekly recap (results)',
      audience: 'All paid entrants, personalized',
      when: 'When you send it after scoring',
      control: 'Week Review → Generate Recap Draft → Blog Editor → "Email to players"',
      pill: { kind: 'manual', label: 'Manual' },
    },
    {
      email: '🔑 Magic link / password reset',
      audience: 'The requesting user',
      when: 'On request',
      control: 'Always on',
      pill: { kind: 'always', label: 'Always' },
    },
  ]

  return (
    <div className="space-y-6">
      {/* Authentication Error Display */}
      {authError && (
        <Card className="border-2 border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="text-red-800 font-medium">Authentication Required</div>
            <div className="text-red-700 text-sm">{authError}</div>
          </CardContent>
        </Card>
      )}

      {/* Status Display */}
      {status && (
        <Card className={`border-2 ${
          status.startsWith('✅') ? 'border-green-200 bg-green-50'
          : status.startsWith('❌') ? 'border-red-200 bg-red-50'
          : 'border-blue-200 bg-blue-50'
        }`}>
          <CardContent className="p-4">
            <div className={`text-sm font-medium ${
              status.startsWith('✅') ? 'text-green-700'
              : status.startsWith('❌') ? 'text-red-700'
              : 'text-blue-700'
            }`}>
              {status}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── What sends, to whom, when ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>📧 Email Center</CardTitle>
          <p className="text-sm text-charcoal-600">
            Every email the platform sends, in one place. Status reflects the live settings.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#faf8f4] border-y border-[#ece7de] text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  <th className="text-left px-3 py-2">Email</th>
                  <th className="text-left px-3 py-2">Who gets it</th>
                  <th className="text-left px-3 py-2">When it sends</th>
                  <th className="text-left px-3 py-2">Where to control it</th>
                  <th className="text-right px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {overviewRows.map((row) => (
                  <tr key={row.email} className="border-b border-[#ece7de] align-top">
                    <td className="px-3 py-2.5 font-medium text-charcoal-900 whitespace-nowrap">{row.email}</td>
                    <td className="px-3 py-2.5 text-charcoal-600">{row.audience}</td>
                    <td className="px-3 py-2.5 text-charcoal-600">{row.when}</td>
                    <td className="px-3 py-2.5 text-charcoal-600">{row.control}</td>
                    <td className="px-3 py-2.5 text-right"><StatusPill kind={row.pill.kind} label={row.pill.label} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Delivery status ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>📮 Delivery Status</CardTitle>
          <p className="text-sm text-charcoal-600">
            Live counts from the email queue. Queued emails are sent automatically (cron); the button is a manual fallback.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-3">
              <div className="px-4 py-3 rounded-lg border border-[#ece7de] bg-[#faf8f4] text-center min-w-[110px]">
                <div className={`text-2xl font-extrabold ${queueStats && queueStats.pending > 0 ? 'text-amber-600' : 'text-charcoal-900'}`}>{queueStats?.pending ?? '—'}</div>
                <div className="text-xs font-semibold text-charcoal-500 uppercase">Pending now</div>
              </div>
              <div className="px-4 py-3 rounded-lg border border-[#ece7de] bg-[#faf8f4] text-center min-w-[110px]">
                <div className="text-2xl font-extrabold text-green-700">{queueStats?.sent7d ?? '—'}</div>
                <div className="text-xs font-semibold text-charcoal-500 uppercase">Sent, 7 days</div>
              </div>
              <div className="px-4 py-3 rounded-lg border border-[#ece7de] bg-[#faf8f4] text-center min-w-[110px]">
                <div className={`text-2xl font-extrabold ${queueStats && queueStats.failed7d > 0 ? 'text-red-600' : 'text-charcoal-900'}`}>{queueStats?.failed7d ?? '—'}</div>
                <div className="text-xs font-semibold text-charcoal-500 uppercase">Failed, 7 days</div>
              </div>
            </div>
            <div className="flex gap-2 ml-auto">
              <Button onClick={loadQueueStats} variant="outline" size="sm">Refresh</Button>
              <Button onClick={handleProcessEmailQueue} disabled={processingEmails} variant="outline" size="sm">
                {processingEmails ? 'Processing…' : 'Process queue now'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Reminder Schedule ─────────────────────────────────────────── */}
      {emailSettings && (
        <Card>
          <CardHeader>
            <CardTitle>⏰ Reminder Schedule</CardTitle>
            <p className="text-sm text-charcoal-600">
              Chase players who haven't submitted, at these hours before the weekly deadline.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <Label className="text-base font-medium">Enable Reminder Emails</Label>
                <p className="text-sm text-charcoal-600">Turn all reminder emails on or off</p>
              </div>
              <Switch
                checked={emailSettings.reminder_schedule.enabled}
                onCheckedChange={(checked) =>
                  setEmailSettings({
                    ...emailSettings,
                    reminder_schedule: { ...emailSettings.reminder_schedule, enabled: checked },
                  })
                }
              />
            </div>

            {emailSettings.reminder_schedule.enabled && (
              <div className="space-y-4">
                {emailSettings.reminder_schedule.reminders.map((reminder, index) => (
                  <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                    <Switch
                      checked={reminder.enabled}
                      onCheckedChange={(checked) => updateReminderSetting(index, { enabled: checked })}
                    />
                    <div className="flex-1">
                      <Input
                        value={reminder.name}
                        onChange={(e) => updateReminderSetting(index, { name: e.target.value })}
                        placeholder="Reminder name"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={reminder.hours_before_deadline}
                        onChange={(e) => updateReminderSetting(index, { hours_before_deadline: parseInt(e.target.value) || 0 })}
                        className="w-20"
                        min="1"
                        max="168"
                      />
                      <span className="text-sm text-charcoal-600">hours before</span>
                    </div>
                    {emailSettings.reminder_schedule.reminders.length > 1 && (
                      <Button onClick={() => removeReminder(index)} variant="outline" className="text-red-600" size="sm">
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
                <Button onClick={addCustomReminder} variant="outline" size="sm">
                  Add Custom Reminder
                </Button>
              </div>
            )}

            <div className="pt-4 border-t">
              <Button onClick={handleUpdateReminderSettings} disabled={loading} size="sm">
                {loading ? 'Saving…' : 'Save Reminder Settings'}
              </Button>
              <p className="text-xs text-charcoal-500 mt-2">
                💡 Changes are only saved to database when you click "Save"
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Week Opening ──────────────────────────────────────────────── */}
      {emailSettings && (
        <Card>
          <CardHeader>
            <CardTitle>📢 Week Opening Email</CardTitle>
            <p className="text-sm text-charcoal-600">
              The "Week N is open — make your picks!" announcement, sent to all active players when you open a week's picks.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <Label className="text-base font-medium">Send Week Opening Emails</Label>
                <p className="text-sm text-charcoal-600">Announce automatically when picks open</p>
              </div>
              <Switch
                checked={emailSettings.open_picks_notifications.enabled}
                onCheckedChange={(checked) =>
                  setEmailSettings({
                    ...emailSettings,
                    open_picks_notifications: { ...emailSettings.open_picks_notifications, enabled: checked },
                  })
                }
              />
            </div>
            <div className="pt-2 border-t">
              <Button onClick={handleUpdateOpenPicksSettings} disabled={loading} size="sm">
                {loading ? 'Saving…' : 'Save Week Opening Settings'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tools ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>🧰 Tools</CardTitle>
          <p className="text-sm text-charcoal-600">Test sends and one-off actions.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="testEmail" className="shrink-0">Test email:</Label>
            <Input
              id="testEmail"
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="your.email@example.com"
              className="w-64"
            />
            <Button onClick={handleTestPickConfirmation} disabled={loading || !testEmail.trim()} variant="outline">
              🧪 Send test pick confirmation
            </Button>
          </div>
          <div className="pt-3 border-t">
            <Button onClick={handleResendWeekOpening} disabled={loading} variant="outline" className="text-amber-700">
              📣 Re-send Week {currentWeek} opening announcement
            </Button>
            <p className="text-xs text-charcoal-500 mt-2">
              ⚠️ Queues the announcement to <b>all active players</b> and sends immediately. Normally this happens
              automatically when you open picks — use this only if that send failed or was skipped.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
