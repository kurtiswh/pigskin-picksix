import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { NotificationScheduler } from '@/services/notificationScheduler'
// import { EmailService } from '@/services/emailService'

interface AdminNotificationsProps {
  currentWeek: number
  currentSeason: number
}

export default function AdminNotifications({ currentWeek, currentSeason }: AdminNotificationsProps) {
  const [loading, setLoading] = useState(false)
  const [processingEmails, setProcessingEmails] = useState(false)
  const [status, setStatus] = useState('')

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
      setStatus('✅ Notifications scheduled successfully!')
      
    } catch (error) {
      console.error('Error scheduling notifications:', error)
      setStatus('❌ Error scheduling notifications: ' + (error as Error).message)
    } finally {
      setLoading(false)
      setTimeout(() => setStatus(''), 5000)
    }
  }

  const handleSendWeeklyResults = async () => {
    try {
      setLoading(true)
      setStatus('Sending weekly results...')
      
      await NotificationScheduler.onWeekCompleted(currentWeek, currentSeason)
      setStatus('✅ Weekly results scheduled successfully!')
      
    } catch (error) {
      console.error('Error sending weekly results:', error)
      setStatus('❌ Error sending weekly results: ' + (error as Error).message)
    } finally {
      setLoading(false)
      setTimeout(() => setStatus(''), 5000)
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

  const handleTestNotifications = async () => {
    try {
      setLoading(true)
      setStatus('Setting up test notifications...')
      
      // This would require a test user ID - you'd need to implement a way to select a user
      // For now, we'll just show instructions
      setStatus('⚠️ Test notifications require a specific user ID. Check the console for implementation details.')
      console.log('To test notifications, call: NotificationScheduler.testNotifications(userId)')
      
    } catch (error) {
      console.error('Error testing notifications:', error)
      setStatus('❌ Error testing notifications: ' + (error as Error).message)
    } finally {
      setLoading(false)
      setTimeout(() => setStatus(''), 5000)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>📧 Email Notifications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && (
          <div className={`p-3 rounded-lg text-sm ${
            status.startsWith('✅') 
              ? 'bg-green-50 text-green-700 border border-green-200'
              : status.startsWith('❌')
              ? 'bg-red-50 text-red-700 border border-red-200'
              : status.startsWith('⚠️')
              ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {status}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <h3 className="font-semibold">Week Management</h3>
            
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
            <p className="text-xs text-charcoal-500">
              Schedules pick reminders and deadline alerts for all users with notifications enabled.
              Only schedules for users who haven't submitted picks yet.
            </p>

            <Button
              onClick={handleSendWeeklyResults}
              disabled={loading}
              className="w-full"
              variant="outline"
            >
              Send Weekly Results
            </Button>
            <p className="text-xs text-charcoal-500">
              Sends weekly results emails to all users with results notifications enabled.
              Use after all games are scored.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold">Email Processing</h3>
            
            <Button
              onClick={handleProcessEmailQueue}
              disabled={processingEmails}
              className="w-full"
              variant="secondary"
            >
              {processingEmails ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
              ) : null}
              Process Email Queue
            </Button>
            <p className="text-xs text-charcoal-500">
              Manually processes pending email jobs. In production, this would run automatically via cron job.
            </p>

            <Button
              onClick={handleTestNotifications}
              disabled={loading}
              className="w-full"
              variant="secondary"
            >
              Test Notifications
            </Button>
            <p className="text-xs text-charcoal-500">
              Set up test notification emails. Check console for details on testing specific users.
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-semibold text-blue-800 mb-2">📋 Email System Overview</h4>
          <div className="text-sm text-blue-700 space-y-1">
            <p><strong>Pick Reminders:</strong> Sent 48 hours before deadline to users who haven't submitted picks</p>
            <p><strong>Deadline Alerts:</strong> Sent 24h and 2h before deadline to users who haven't submitted</p>
            <p><strong>Weekly Results:</strong> Sent after week is completed and scored</p>
            <p><strong>Auto-cancellation:</strong> Pick reminders/alerts are cancelled when user submits picks</p>
          </div>
        </div>

        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <h4 className="font-semibold text-amber-800 mb-2">⚙️ Setup Status</h4>
          <div className="text-sm text-amber-700 space-y-1">
            <p>✅ Database migration: <code className="bg-amber-100 px-1 rounded">012_add_email_jobs.sql</code></p>
            <p>{import.meta.env.VITE_RESEND_API_KEY ? '✅' : '❌'} Email provider: {import.meta.env.VITE_RESEND_API_KEY ? 'Resend configured' : 'No Resend API key found'}</p>
            <p>⚠️ Cron job: Manual processing only (set up cron for production)</p>
            <p>✅ User preferences: Available in user profiles</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}