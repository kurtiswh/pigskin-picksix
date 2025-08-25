/**
 * Email Testing Utilities
 * Console-based testing functions for email confirmation system
 */

import { EmailService, EmailTemplates } from '@/services/emailService'
import { NotificationScheduler } from '@/services/notificationScheduler'
import { supabase } from '@/lib/supabase'

/**
 * Test pick confirmation email with mock data
 * Usage: Call this from browser console when on admin page
 */
export const testPickConfirmationEmail = async (
  testEmail: string = 'test@example.com',
  testName: string = 'Test User'
) => {
  console.log('🧪 Testing pick confirmation email...')
  
  // Mock picks data
  const mockPicks = [
    { game: "Georgia @ Alabama", pick: "Alabama", isLock: true, lockTime: "2024-09-07T19:00:00.000Z" },
    { game: "Michigan @ Ohio State", pick: "Ohio State", isLock: false, lockTime: "2024-09-07T15:30:00.000Z" },
    { game: "Texas @ Oklahoma", pick: "Texas", isLock: false, lockTime: "2024-09-07T20:00:00.000Z" },
    { game: "USC @ Oregon", pick: "Oregon", isLock: false, lockTime: "2024-09-07T17:00:00.000Z" },
    { game: "Notre Dame @ Navy", pick: "Notre Dame", isLock: false, lockTime: "2024-09-07T16:00:00.000Z" },
    { game: "Clemson @ Florida State", pick: "Clemson", isLock: false, lockTime: "2024-09-07T18:00:00.000Z" }
  ]

  try {
    console.log('🔄 Starting pick confirmation test...')
    
    // Get the current user's ID for testing
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('No authenticated user found. Please log in first.')
    }
    
    console.log(`   User: ${user.id}`)
    console.log(`   Email: ${testEmail}`)
    console.log(`   Name: ${testName}`)
    console.log(`   Picks: ${mockPicks.length} games`)
    
    // Test authenticated user pick confirmation using real user ID
    await NotificationScheduler.onPicksSubmitted(
      user.id, // Use real authenticated user ID
      testEmail,
      testName,
      1, // week
      2024, // season
      mockPicks
    )
    
    console.log('✅ Pick confirmation email should have been processed automatically!')
    console.log('📧 Email details:')
    console.log(`  To: ${testEmail}`)
    console.log(`  Name: ${testName}`)
    console.log(`  Picks: ${mockPicks.length} games with 1 lock pick`)
    console.log('📋 Note: Only the pick confirmation email was processed, not the entire queue')
    
    return true
  } catch (error) {
    console.error('❌ Error testing pick confirmation:', error)
    console.error('❌ Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      error: error
    })
    return false
  }
}

/**
 * Test anonymous pick confirmation email
 */
export const testAnonymousPickConfirmation = async (
  testEmail: string = 'test@example.com',
  testName: string = 'Anonymous Test User'
) => {
  console.log('🧪 Testing anonymous pick confirmation email...')
  
  const mockPicks = [
    { game: "Georgia @ Alabama", pick: "Alabama", isLock: true, lockTime: "2024-09-07T19:00:00.000Z" },
    { game: "Michigan @ Ohio State", pick: "Ohio State", isLock: false, lockTime: "2024-09-07T15:30:00.000Z" },
    { game: "Texas @ Oklahoma", pick: "Texas", isLock: false, lockTime: "2024-09-07T20:00:00.000Z" },
    { game: "USC @ Oregon", pick: "Oregon", isLock: false, lockTime: "2024-09-07T17:00:00.000Z" },
    { game: "Notre Dame @ Navy", pick: "Notre Dame", isLock: false, lockTime: "2024-09-07T16:00:00.000Z" },
    { game: "Clemson @ Florida State", pick: "Clemson", isLock: false, lockTime: "2024-09-07T18:00:00.000Z" }
  ]

  try {
    await EmailService.sendPickConfirmation(
      'anonymous',
      testEmail,
      testName,
      1, // week
      2024, // season
      mockPicks,
      new Date()
    )
    
    console.log('✅ Anonymous pick confirmation email queued successfully!')
    console.log('📧 Email details:')
    console.log(`  To: ${testEmail}`)
    console.log(`  Name: ${testName}`)
    console.log(`  Picks: ${mockPicks.length} games with 1 lock pick`)
    console.log('📋 Next step: Call processTestEmailQueue() to send the email')
    
    return true
  } catch (error) {
    console.error('❌ Error testing anonymous pick confirmation:', error)
    return false
  }
}

/**
 * Process pending email queue (sends test emails)
 */
export const processTestEmailQueue = async () => {
  console.log('📤 Processing email queue...')
  
  try {
    const result = await NotificationScheduler.processEmailQueue()
    console.log(`✅ Email queue processed!`)
    console.log(`📊 Results: ${result.processed} emails sent, ${result.errors} errors`)
    
    if (result.errors > 0) {
      console.warn('⚠️ Some emails failed to send. Check Resend configuration.')
    }
    
    return result
  } catch (error) {
    console.error('❌ Error processing email queue:', error)
    return null
  }
}

/**
 * Test notification scheduling (reminders)
 */
export const testNotificationScheduling = async (
  testUserId?: string
) => {
  console.log('🧪 Testing notification scheduling...')
  
  try {
    // Get the current user's ID if not provided
    let userId = testUserId
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('No authenticated user found. Please log in first.')
      }
      userId = user.id
    }
    
    console.log(`   Using user ID: ${userId}`)
    
    // Calculate deadline 3 days from now
    const deadline = new Date()
    deadline.setDate(deadline.getDate() + 3)
    
    await NotificationScheduler.onWeekOpened(1, 2024, deadline, 15)
    
    console.log('✅ Notification scheduling test completed!')
    console.log(`📅 Test deadline: ${deadline.toLocaleString()}`)
    console.log('📧 Reminders scheduled based on admin settings')
    console.log('📋 Next step: Call processTestEmailQueue() to send scheduled emails')
    
    return true
  } catch (error) {
    console.error('❌ Error testing notification scheduling:', error)
    return false
  }
}

/**
 * Check what emails are currently in the queue
 */
export const checkEmailQueue = async () => {
  console.log('📋 Checking email queue status...')
  
  try {
    const { data: pendingJobs, error } = await supabase
      .from('email_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('❌ Error checking email queue:', error)
      return null
    }

    console.log(`📊 Email queue status: ${pendingJobs?.length || 0} recent jobs`)
    
    if (pendingJobs && pendingJobs.length > 0) {
      const statusCount = pendingJobs.reduce((acc: any, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1
        return acc
      }, {})
      
      console.log('📈 Job status breakdown:', statusCount)
      
      const pendingEmails = pendingJobs.filter(job => job.status === 'pending')
      if (pendingEmails.length > 0) {
        console.log(`⚠️ ${pendingEmails.length} pending emails in queue:`)
        pendingEmails.forEach(job => {
          console.log(`  📧 ${job.template_type}: ${job.subject} -> ${job.email}`)
        })
      }
      
      return pendingJobs
    } else {
      console.log('✅ Email queue is empty')
      return []
    }
  } catch (error) {
    console.error('❌ Exception checking email queue:', error)
    return null
  }
}

/**
 * Test all email templates to verify they work correctly
 */
export const testAllTemplates = () => {
  console.log('🧪 Testing all email templates...')
  
  try {
    const testDate = new Date('2024-09-07T19:00:00Z')
    const mockPicks = [
      { game: "Georgia @ Alabama", pick: "Alabama", isLock: true, lockTime: "2024-09-07T19:00:00.000Z" },
      { game: "Michigan @ Ohio State", pick: "Ohio State", isLock: false, lockTime: "2024-09-07T15:30:00.000Z" }
    ]
    const mockStats = {
      points: 40,
      record: '2-0',
      rank: 5,
      totalPlayers: 50,
      picks: [
        { game: "Georgia @ Alabama", pick: "Alabama", result: 'win' as const, points: 20, isLock: true },
        { game: "Michigan @ Ohio State", pick: "Ohio State", result: 'win' as const, points: 20, isLock: false }
      ]
    }
    
    // Test all templates
    const templates = {
      pickReminder: EmailTemplates.pickReminder('Test User', 1, 2024, testDate),
      deadlineAlert: EmailTemplates.deadlineAlert('Test User', 1, 2024, testDate, 2),
      weeklyResults: EmailTemplates.weeklyResults('Test User', 1, 2024, mockStats),
      picksSubmitted: EmailTemplates.picksSubmitted('Test User', 1, 2024, mockPicks, testDate),
      weekOpened: EmailTemplates.weekOpened(1, 2024, testDate, 15),
      magicLink: EmailTemplates.magicLink('Test User', 'https://example.com/magic?token=123'),
      passwordReset: EmailTemplates.passwordReset('Test User', 'https://example.com/reset?token=456')
    }
    
    console.log('✅ Template Test Results:')
    Object.entries(templates).forEach(([name, template]) => {
      console.log(`  📧 ${name}:`, {
        subject: template.subject,
        htmlLength: template.html.length,
        textLength: template.text.length,
        valid: !!(template.subject && template.html && template.text)
      })
    })
    
    console.log('🎉 All templates generated successfully!')
    console.log('📋 Next: Test email sending with processTestEmailQueue()')
    return templates
    
  } catch (error) {
    console.error('❌ Template test failed:', error)
    return null
  }
}

/**
 * Debug admin email settings to see what's enabled
 */
export const checkAdminEmailSettings = async (season: number = 2024) => {
  console.log(`🔍 Checking admin email settings for season ${season}...`)
  
  try {
    const { AdminEmailSettingsService } = await import('@/services/adminEmailSettings')
    
    // Check all settings
    const settings = await AdminEmailSettingsService.getEmailSettings(season)
    console.log('📊 Full email settings:', JSON.stringify(settings, null, 2))
    
    // Check individual flags
    const openPicksEnabled = await AdminEmailSettingsService.isOpenPicksNotificationEnabled(season)
    const weeklyResultsEnabled = await AdminEmailSettingsService.isWeeklyResultsEnabled(season)
    const weeklyResultsAutoSend = await AdminEmailSettingsService.isWeeklyResultsAutoSendEnabled(season)
    const reminderTimes = await AdminEmailSettingsService.getEnabledReminderTimes(season)
    
    console.log('🎛️ Admin Email Settings Summary:')
    console.log(`  📧 Open Picks Notifications: ${openPicksEnabled ? '✅ ENABLED' : '❌ DISABLED'}`)
    console.log(`  📊 Weekly Results: ${weeklyResultsEnabled ? '✅ ENABLED' : '❌ DISABLED'}`)
    console.log(`  🔄 Weekly Results Auto-Send: ${weeklyResultsAutoSend ? '✅ ENABLED' : '❌ DISABLED'}`)
    console.log(`  ⏰ Reminder Times: ${reminderTimes.length > 0 ? `✅ ${reminderTimes.join('h, ')}h` : '❌ ALL DISABLED'}`)
    
    return {
      openPicksEnabled,
      weeklyResultsEnabled, 
      weeklyResultsAutoSend,
      reminderTimes,
      fullSettings: settings
    }
    
  } catch (error) {
    console.error('❌ Error checking admin settings:', error)
    return null
  }
}

// Make functions available globally for console testing
if (typeof window !== 'undefined') {
  // Ensure window properties exist
  (window as any).testPickConfirmationEmail = testPickConfirmationEmail
  (window as any).testAnonymousPickConfirmation = testAnonymousPickConfirmation
  (window as any).processTestEmailQueue = processTestEmailQueue
  (window as any).testNotificationScheduling = testNotificationScheduling
  (window as any).testAllTemplates = testAllTemplates
  (window as any).checkEmailQueue = checkEmailQueue
  (window as any).checkAdminEmailSettings = checkAdminEmailSettings
  
  // Also add to a namespace for easier access
  ;(window as any).emailTesting = {
    testPickConfirmationEmail,
    testAnonymousPickConfirmation,
    processTestEmailQueue,
    testNotificationScheduling,
    testAllTemplates,
    checkEmailQueue,
    checkAdminEmailSettings
  }
  
  console.log('🧪 Email testing utilities loaded!')
  console.log('📋 Available functions:')
  console.log('  - checkEmailQueue() - See what emails are in the queue')
  console.log('  - checkAdminEmailSettings() - Debug admin email settings')
  console.log('  - testAllTemplates() - Test all email templates')
  console.log('  - testPickConfirmationEmail("your.email@example.com", "Your Name")')
  console.log('  - testAnonymousPickConfirmation("your.email@example.com", "Your Name")')
  console.log('  - processTestEmailQueue() - Process ALL pending emails (use carefully!)')
  console.log('  - testNotificationScheduling()')
  console.log('  - Or use emailTesting.checkAdminEmailSettings() for namespaced access')
  
  // Force registration after a short delay to ensure DOM is ready
  setTimeout(() => {
    if (!(window as any).processTestEmailQueue) {
      (window as any).processTestEmailQueue = processTestEmailQueue
      console.log('🔄 Re-registered processTestEmailQueue function')
    }
  }, 1000)
}