import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NotificationScheduler } from '@/services/notificationScheduler'
import { AdminEmailSettingsService, AdminEmailSettings, ReminderSetting } from '@/services/adminEmailSettings'
import { ENV } from '@/lib/env'
import { supabase } from '@/lib/supabase'
import '@/utils/emailTesting' // Load testing utilities for console access

interface AdminNotificationsProps {
  currentWeek: number
  currentSeason: number
}

export default function AdminNotifications({ currentWeek, currentSeason }: AdminNotificationsProps) {
  const [loading, setLoading] = useState(false)
  const [processingEmails, setProcessingEmails] = useState(false)
  const [status, setStatus] = useState('')
  const [emailSettings, setEmailSettings] = useState<AdminEmailSettings | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [testEmail, setTestEmail] = useState('admin@pigskinpicksix.com')

  // Load current email settings on component mount
  useEffect(() => {
    loadEmailSettings()
  }, [currentSeason])

  const loadEmailSettings = async () => {
    try {
      setSettingsLoading(true)
      const settings = await AdminEmailSettingsService.getEmailSettings(currentSeason)
      setEmailSettings(settings)
    } catch (error) {
      console.error('Error loading email settings:', error)
      setStatus('❌ Error loading email settings: ' + (error as Error).message)
    } finally {
      setSettingsLoading(false)
    }
  }

  const handleScheduleWeekNotifications = async () => {
    try {
      setLoading(true)
      setStatus('Scheduling notifications...')
      
      // Calculate deadline (next Saturday at 11 AM CT)
      const now = new Date()
      const nextSaturday = new Date(now)
      const daysUntilSaturday = (6 - now.getDay() + 7) % 7 || 7
      nextSaturday.setDate(now.getDate() + daysUntilSaturday)
      nextSaturday.setHours(16, 0, 0, 0) // 11 AM CT = 16 UTC
      
      await NotificationScheduler.onWeekOpened(currentWeek, currentSeason, nextSaturday)
      setStatus('✅ Week notifications scheduled! Processing emails...')
      
      // Auto-process email queue to send week opening emails immediately
      try {
        const result = await NotificationScheduler.processEmailQueue()
        setStatus(`✅ Week notifications sent! Processed ${result.processed} emails (${result.errors} errors)`)
      } catch (processError) {
        console.warn('Could not auto-process week opening emails:', processError)
        setStatus('✅ Week notifications scheduled! Click "Process Email Queue" to send them.')
      }
      
    } catch (error) {
      console.error('Error scheduling notifications:', error)
      setStatus('❌ Error scheduling notifications: ' + (error as Error).message)
    } finally {
      setLoading(false)
      setTimeout(() => setStatus(''), 8000) // Longer timeout for combined message
    }
  }

  const handleSendWeeklyResults = async () => {
    try {
      setLoading(true)
      setStatus('Sending weekly results...')
      
      await NotificationScheduler.onWeekCompleted(currentWeek, currentSeason)
      setStatus('✅ Weekly results queued! Processing emails...')
      
      // Auto-process email queue to send weekly results immediately
      try {
        const result = await NotificationScheduler.processEmailQueue()
        setStatus(`✅ Weekly results sent! Processed ${result.processed} emails (${result.errors} errors)`)
      } catch (processError) {
        console.warn('Could not auto-process weekly results emails:', processError)
        setStatus('✅ Weekly results queued! Click "Process Email Queue" to send them.')
      }
      
    } catch (error) {
      console.error('Error sending weekly results:', error)
      setStatus('❌ Error sending weekly results: ' + (error as Error).message)
    } finally {
      setLoading(false)
      setTimeout(() => setStatus(''), 8000) // Longer timeout for combined message
    }
  }

  const handleProcessEmailQueue = async () => {
    try {
      setProcessingEmails(true)
      setStatus('Processing email queue...')
      
      const result = await NotificationScheduler.processEmailQueue()
      setStatus(`✅ Processed ${result.processed} emails, ${result.errors} errors`)
      
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
      
      // Get current authenticated user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        throw new Error('Must be authenticated to send test emails')
      }
      
      // Create mock picks for testing
      const mockPicks = [
        { game: "Georgia @ Alabama", pick: "Alabama", isLock: true, lockTime: "2024-09-07T19:00:00.000Z" },
        { game: "Michigan @ Ohio State", pick: "Ohio State", isLock: false, lockTime: "2024-09-07T15:30:00.000Z" },
        { game: "Texas @ Oklahoma", pick: "Texas", isLock: false, lockTime: "2024-09-07T20:00:00.000Z" },
        { game: "USC @ Oregon", pick: "Oregon", isLock: false, lockTime: "2024-09-07T17:00:00.000Z" },
        { game: "Notre Dame @ Navy", pick: "Notre Dame", isLock: false, lockTime: "2024-09-07T16:00:00.000Z" },
        { game: "Clemson @ Florida State", pick: "Clemson", isLock: false, lockTime: "2024-09-07T18:00:00.000Z" }
      ]

      // Use the authenticated user ID and configured test email
      const testName = 'Test Admin'
      
      await NotificationScheduler.onPicksSubmitted(
        user.id, // Use real authenticated user ID
        testEmail,
        testName,
        currentWeek,
        currentSeason,
        mockPicks
      )
      
      setStatus(`✅ Test pick confirmation sent to ${testEmail}! Check the email_jobs table and process the queue.`)
      
    } catch (error) {
      console.error('Error sending test pick confirmation:', error)
      setStatus('❌ Error sending test email: ' + (error as Error).message)
    } finally {
      setLoading(false)
      setTimeout(() => setStatus(''), 8000)
    }
  }

  const handleUpdateReminderSettings = async () => {
    if (!emailSettings) return
    
    try {
      setLoading(true)
      setStatus('Updating reminder settings...')
      
      await AdminEmailSettingsService.updateReminderSchedule(currentSeason, emailSettings.reminder_schedule)
      setStatus('✅ Reminder settings updated successfully!')
      
      // Reload settings to sync UI with database
      await loadEmailSettings()
      
    } catch (error) {
      console.error('Error updating reminder settings:', error)
      setStatus('❌ Error updating settings: ' + (error as Error).message)
    } finally {
      setLoading(false)
      setTimeout(() => setStatus(''), 3000)
    }
  }

  const handleUpdateOpenPicksSettings = async () => {
    if (!emailSettings) return
    
    try {
      setLoading(true)
      setStatus('Updating open picks settings...')
      
      await AdminEmailSettingsService.updateOpenPicksSettings(currentSeason, emailSettings.open_picks_notifications)
      setStatus('✅ Open picks settings updated successfully!')
      
      // Reload settings to sync UI with database
      await loadEmailSettings()
      
    } catch (error) {
      console.error('Error updating open picks settings:', error)
      setStatus('❌ Error updating settings: ' + (error as Error).message)
    } finally {
      setLoading(false)
      setTimeout(() => setStatus(''), 3000)
    }
  }

  const handleUpdateWeeklyResultsSettings = async () => {
    if (!emailSettings) return
    
    try {
      setLoading(true)
      setStatus('Updating weekly results settings...')
      
      await AdminEmailSettingsService.updateWeeklyResultsSettings(currentSeason, emailSettings.weekly_results)
      setStatus('✅ Weekly results settings updated successfully!')
      
      // Reload settings to sync UI with database
      await loadEmailSettings()
      
    } catch (error) {
      console.error('Error updating weekly results settings:', error)
      setStatus('❌ Error updating settings: ' + (error as Error).message)
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
      reminder_schedule: {
        ...emailSettings.reminder_schedule,
        reminders: newReminders
      }
    })
  }

  const addCustomReminder = () => {
    if (!emailSettings) return
    
    const newReminder: ReminderSetting = {
      name: 'Custom Reminder',
      hours_before_deadline: 6,
      enabled: true
    }
    
    setEmailSettings({
      ...emailSettings,
      reminder_schedule: {
        ...emailSettings.reminder_schedule,
        reminders: [...emailSettings.reminder_schedule.reminders, newReminder]
      }
    })
  }

  const removeReminder = (index: number) => {
    if (!emailSettings) return
    
    const newReminders = emailSettings.reminder_schedule.reminders.filter((_, i) => i !== index)
    
    setEmailSettings({
      ...emailSettings,
      reminder_schedule: {
        ...emailSettings.reminder_schedule,
        reminders: newReminders
      }
    })
  }

  if (settingsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>📧 Email Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="w-6 h-6 border-2 border-pigskin-600 border-t-transparent rounded-full animate-spin mr-3"></div>
            Loading email settings...
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Status Display */}
      {status && (
        <Card className={`border-2 ${
          status.startsWith('✅') 
            ? 'border-green-200 bg-green-50'
            : status.startsWith('❌')
            ? 'border-red-200 bg-red-50'
            : status.startsWith('⚠️')
            ? 'border-yellow-200 bg-yellow-50'
            : 'border-blue-200 bg-blue-50'
        }`}>
          <CardContent className="p-4">
            <div className={`text-sm font-medium ${
              status.startsWith('✅') ? 'text-green-700'
              : status.startsWith('❌') ? 'text-red-700'
              : status.startsWith('⚠️') ? 'text-yellow-700'
              : 'text-blue-700'
            }`}>
              {status}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email Processing Architecture Info */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="text-blue-800">📬 Email Processing Architecture</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-blue-700">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-3 bg-white rounded border border-blue-200">
                <h4 className="font-semibold text-blue-800 mb-2">⚡ Immediate Processing</h4>
                <ul className="space-y-1 text-xs">
                  <li>• Pick confirmations (on submission)</li>
                  <li>• Week opening emails (admin button)</li>
                  <li>• Weekly results (admin button)</li>
                </ul>
              </div>
              <div className="p-3 bg-white rounded border border-blue-200">
                <h4 className="font-semibold text-blue-800 mb-2">🕐 Background Processing</h4>
                <ul className="space-y-1 text-xs">
                  <li>• Pick reminders (cron every 15min)</li>
                  <li>• Deadline alerts (cron every 15min)</li>
                  <li>• Runs 6 AM - 11 PM CT</li>
                </ul>
              </div>
              <div className="p-3 bg-white rounded border border-blue-200">
                <h4 className="font-semibold text-blue-800 mb-2">🔧 Manual Fallback</h4>
                <ul className="space-y-1 text-xs">
                  <li>• Process Email Queue button</li>
                  <li>• Use if auto-processing fails</li>
                  <li>• Troubleshooting & testing</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>📧 Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Button
              onClick={handleScheduleWeekNotifications}
              disabled={loading}
              className="w-full"
              variant="outline"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-pigskin-600 border-t-transparent rounded-full animate-spin mr-2"></div>
              ) : null}
              Schedule Week Notifications
            </Button>
            
            <Button
              onClick={handleSendWeeklyResults}
              disabled={loading}
              className="w-full"
              variant="outline"
            >
              Send Weekly Results
            </Button>
            
            <Button
              onClick={handleTestPickConfirmation}
              disabled={loading}
              className="w-full"
              variant="outline"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-pigskin-600 border-t-transparent rounded-full animate-spin mr-2"></div>
              ) : null}
              🧪 Test Pick Confirmation
            </Button>
            
            <Button
              onClick={handleProcessEmailQueue}
              disabled={processingEmails}
              className="w-full"
              variant="secondary"
              title="Manual fallback for email processing (troubleshooting)"
            >
              {processingEmails ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
              ) : null}
              🔧 Process Email Queue
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reminder Schedule Configuration */}
      {emailSettings && (
        <Card>
          <CardHeader>
            <CardTitle>⏰ Reminder Schedule</CardTitle>
            <p className="text-sm text-charcoal-600">Configure when reminder emails are sent before the deadline.</p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Master Toggle */}
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
                    reminder_schedule: { ...emailSettings.reminder_schedule, enabled: checked }
                  })
                }
              />
            </div>

            {/* Individual Reminders */}
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
                        className="mb-2"
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
                      <Button
                        onClick={() => removeReminder(index)}
                        variant="destructive"
                        size="sm"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
                
                <div className="flex gap-2">
                  <Button onClick={addCustomReminder} variant="outline" size="sm">
                    Add Custom Reminder
                  </Button>
                </div>
              </div>
            )}
            
            {/* Save button always visible (moved outside the conditional) */}
            <div className="pt-4 border-t">
              <Button 
                onClick={handleUpdateReminderSettings}
                disabled={loading}
                size="sm"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                ) : null}
                Save Reminder Settings
              </Button>
              <p className="text-xs text-charcoal-500 mt-2">
                💡 Changes are only saved to database when you click "Save"
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Open Picks Notifications */}
      {emailSettings && (
        <Card>
          <CardHeader>
            <CardTitle>📢 Week Opening Notifications</CardTitle>
            <p className="text-sm text-charcoal-600">Control when users are notified about new weeks opening for picks.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <Label className="text-base font-medium">Send Week Opening Emails</Label>
                <p className="text-sm text-charcoal-600">Notify all users when a new week opens for picks</p>
              </div>
              <Switch
                checked={emailSettings.open_picks_notifications.enabled}
                onCheckedChange={(checked) => 
                  setEmailSettings({
                    ...emailSettings,
                    open_picks_notifications: { ...emailSettings.open_picks_notifications, enabled: checked }
                  })
                }
              />
            </div>
            
            {emailSettings.open_picks_notifications.enabled && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Send When Scheduled</Label>
                    <p className="text-sm text-charcoal-600">Send emails immediately when admin clicks "Schedule Week Notifications"</p>
                  </div>
                  <Switch
                    checked={emailSettings.open_picks_notifications.send_immediately}
                    onCheckedChange={(checked) => 
                      setEmailSettings({
                        ...emailSettings,
                        open_picks_notifications: { ...emailSettings.open_picks_notifications, send_immediately: checked }
                      })
                    }
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Include Game Count</Label>
                    <p className="text-sm text-charcoal-600">Show total number of games in the email</p>
                  </div>
                  <Switch
                    checked={emailSettings.open_picks_notifications.include_total_games}
                    onCheckedChange={(checked) => 
                      setEmailSettings({
                        ...emailSettings,
                        open_picks_notifications: { ...emailSettings.open_picks_notifications, include_total_games: checked }
                      })
                    }
                  />
                </div>
              </div>
            )}
            
            {/* Save button always visible */}
            <div className="pt-4 border-t">
              <Button 
                onClick={handleUpdateOpenPicksSettings}
                disabled={loading}
                size="sm"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                ) : null}
                Save Week Opening Settings
              </Button>
              <p className="text-xs text-charcoal-500 mt-2">
                💡 Changes are only saved to database when you click "Save"
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly Results Settings */}
      {emailSettings && (
        <Card>
          <CardHeader>
            <CardTitle>📊 Weekly Results</CardTitle>
            <p className="text-sm text-charcoal-600">Configure manual weekly results emails. Use "Send Weekly Results" button above when ready.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <Label className="text-base font-medium">Enable Weekly Results Emails</Label>
                <p className="text-sm text-charcoal-600">Send results summary to all users after week completion</p>
              </div>
              <Switch
                checked={emailSettings.weekly_results.enabled}
                onCheckedChange={(checked) => 
                  setEmailSettings({
                    ...emailSettings,
                    weekly_results: { ...emailSettings.weekly_results, enabled: checked }
                  })
                }
              />
            </div>
            
            {emailSettings.weekly_results.enabled && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="text-blue-500 mt-1">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-medium text-blue-800">Manual Send Only</h4>
                      <p className="text-sm text-blue-700 mt-1">
                        Weekly results will only be sent when you click the "Send Weekly Results" button above. 
                        No automatic sending is configured.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Save button always visible */}
            <div className="pt-4 border-t">
              <Button 
                onClick={handleUpdateWeeklyResultsSettings}
                disabled={loading}
                size="sm"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                ) : null}
                Save Weekly Results Settings
              </Button>
              <p className="text-xs text-charcoal-500 mt-2">
                💡 Changes are only saved to database when you click "Save"
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email Testing */}
      <Card>
        <CardHeader>
          <CardTitle>🧪 Email Testing</CardTitle>
          <p className="text-sm text-charcoal-600">Test email functionality safely without affecting real users.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Label htmlFor="testEmail" className="min-w-0 flex-shrink-0">Test Email:</Label>
            <Input
              id="testEmail"
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="your.email@example.com"
              className="flex-1"
            />
          </div>
          
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            <p className="font-semibold text-blue-800 mb-2">📋 How to Test Pick Confirmation Emails:</p>
            <ol className="text-blue-700 space-y-1 list-decimal list-inside">
              <li>Enter your email address above</li>
              <li>Click "🧪 Test Pick Confirmation" button</li>
              <li>Email will be sent automatically (no manual processing needed)</li>
              <li>Check your email (including spam folder)</li>
              <li>If auto-processing fails, use "Process Email Queue" button</li>
            </ol>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
            <p className="font-semibold text-amber-800 mb-2">⚠️ Testing Notes:</p>
            <ul className="text-amber-700 space-y-1 list-disc list-inside">
              <li>Test emails use mock pick data (6 games with 1 lock)</li>
              <li>No real user data is affected during testing</li>
              <li>Pick confirmations are auto-processed (sent immediately)</li>
              <li>Check your email provider's sending limits</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle>⚙️ System Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <p>✅ Database: <code className="bg-gray-100 px-1 rounded">038_fix_email_jobs_rls_policies.sql</code></p>
              <p>{ENV.RESEND_API_KEY ? '✅' : '❌'} Email provider: {ENV.RESEND_API_KEY ? 'Resend configured' : 'No Resend API key found'}</p>
              <p>✅ User preferences: Available in profiles</p>
            </div>
            <div className="space-y-2">
              <p>✅ Pick confirmations: Auto-sent immediately</p>
              <p>✅ Week opening emails: Auto-sent on admin action</p>
              <p>✅ Weekly results: Auto-sent on admin action</p>
              <p>⚠️ Reminder cron: Deploy process-reminders function</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}