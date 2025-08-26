/**
 * Email Testing Utilities
 * Console-based testing functions for email confirmation system
 */

import { EmailService, EmailTemplates } from '@/services/emailService'
import { NotificationScheduler } from '@/services/notificationScheduler'
import { AdminEmailSettingsService } from '@/services/adminEmailSettings'
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
 * Clear all pending emails from the queue (use carefully!)
 */
export const clearEmailQueue = async () => {
  console.log('🗑️ Clearing email queue...')
  
  try {
    const { data: result, error } = await supabase
      .from('email_jobs')
      .delete()
      .eq('status', 'pending')
      .select()

    if (error) {
      console.error('❌ Error clearing email queue:', error)
      return null
    }

    console.log(`✅ Cleared ${result?.length || 0} pending emails from queue`)
    return result
    
  } catch (error) {
    console.error('❌ Exception clearing email queue:', error)
    return null
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
 * Initialize admin email settings with default values
 */
export const initializeDefaultEmailSettings = async (season: number = 2024) => {
  console.log(`🔧 Initializing default email settings for season ${season}...`)
  
  try {
    // Get current admin user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      throw new Error('Must be authenticated as admin to initialize settings')
    }

    // Check if user is admin
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !userProfile?.is_admin) {
      throw new Error('Must be admin to initialize email settings')
    }

    console.log('✅ Admin user confirmed, inserting default settings...')

    // Insert default settings
    const defaultSettings = [
      {
        season,
        setting_key: 'reminder_schedule',
        setting_value: {
          enabled: false, // Start disabled
          reminders: [
            { name: "48 Hour Reminder", hours_before_deadline: 48, enabled: false },
            { name: "24 Hour Reminder", hours_before_deadline: 24, enabled: false },
            { name: "Final Reminder", hours_before_deadline: 2, enabled: false }
          ]
        },
        created_by: user.id
      },
      {
        season,
        setting_key: 'open_picks_notifications',
        setting_value: {
          enabled: false, // Start disabled
          send_immediately: true,
          include_total_games: true
        },
        created_by: user.id
      },
      {
        season,
        setting_key: 'weekly_results',
        setting_value: {
          enabled: false, // Start disabled
          manual_only: true
        },
        created_by: user.id
      }
    ]

    const { data, error } = await supabase
      .from('admin_email_settings')
      .upsert(defaultSettings, {
        onConflict: 'season,setting_key'
      })
      .select()

    if (error) {
      console.error('❌ Error initializing settings:', error)
      throw error
    }

    console.log('✅ Default email settings initialized!')
    console.log('📊 Inserted records:', JSON.stringify(data, null, 2))
    
    return data

  } catch (error) {
    console.error('❌ Failed to initialize default settings:', error)
    return null
  }
}

/**
 * Check what's actually in the admin_email_settings database table
 */
export const checkDatabaseEmailSettings = async (season: number = 2024) => {
  console.log(`🔍 Checking RAW database for season ${season}...`)
  
  try {
    const { data: rawData, error } = await supabase
      .from('admin_email_settings')
      .select('*')
      .eq('season', season)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('❌ Database query error:', error)
      return null
    }

    console.log('📊 Raw database records:', JSON.stringify(rawData, null, 2))
    console.log(`📋 Found ${rawData?.length || 0} records in database`)
    
    if (!rawData || rawData.length === 0) {
      console.log('⚠️ NO RECORDS FOUND - Service will use hardcoded defaults (all TRUE)')
      console.log('💡 This explains why everything appears enabled!')
    }
    
    return rawData
    
  } catch (error) {
    console.error('❌ Database check failed:', error)
    return null
  }
}

/**
 * Debug admin email settings to see what's enabled
 */
export const checkAdminEmailSettings = async (season: number = 2024) => {
  console.log(`🔍 Checking admin email settings for season ${season}...`)
  
  try {
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

// Force registration function that can be called explicitly
export const registerGlobalEmailTesting = () => {
  if (typeof window === 'undefined') return
  
  console.log('🔧 Registering email testing functions globally...')
  
  // Register all async functions with error handling
  ;(window as any).testPickConfirmationEmail = async (email = 'test@example.com', name = 'Test User') => {
    try {
      return await testPickConfirmationEmail(email, name)
    } catch (error) {
      console.error('❌ testPickConfirmationEmail failed:', error)
      return false
    }
  }
  
  ;(window as any).testAnonymousPickConfirmation = async (email = 'test@example.com', name = 'Test User') => {
    try {
      return await testAnonymousPickConfirmation(email, name)
    } catch (error) {
      console.error('❌ testAnonymousPickConfirmation failed:', error)
      return false
    }
  }
  
  ;(window as any).processTestEmailQueue = async () => {
    try {
      return await processTestEmailQueue()
    } catch (error) {
      console.error('❌ processTestEmailQueue failed:', error)
      return null
    }
  }
  
  ;(window as any).testNotificationScheduling = async (userId?: string) => {
    try {
      return await testNotificationScheduling(userId)
    } catch (error) {
      console.error('❌ testNotificationScheduling failed:', error)
      return false
    }
  }
  
  ;(window as any).checkEmailQueue = async () => {
    try {
      return await checkEmailQueue()
    } catch (error) {
      console.error('❌ checkEmailQueue failed:', error)
      return null
    }
  }
  
  ;(window as any).checkAdminEmailSettings = async (season = 2024) => {
    try {
      return await checkAdminEmailSettings(season)
    } catch (error) {
      console.error('❌ checkAdminEmailSettings failed:', error)
      return null
    }
  }
  
  ;(window as any).clearEmailQueue = async () => {
    try {
      return await clearEmailQueue()
    } catch (error) {
      console.error('❌ clearEmailQueue failed:', error)
      return null
    }
  }
  
  ;(window as any).checkDatabaseEmailSettings = async (season = 2024) => {
    try {
      return await checkDatabaseEmailSettings(season)
    } catch (error) {
      console.error('❌ checkDatabaseEmailSettings failed:', error)
      return null
    }
  }
  
  ;(window as any).initializeDefaultEmailSettings = async (season = 2024) => {
    try {
      return await initializeDefaultEmailSettings(season)
    } catch (error) {
      console.error('❌ initializeDefaultEmailSettings failed:', error)
      return null
    }
  }
  
  ;(window as any).testAllTemplates = () => {
    try {
      return testAllTemplates()
    } catch (error) {
      console.error('❌ testAllTemplates failed:', error)
      return null
    }
  }
  
  // Add simple wrapper functions for easier console usage
  ;(window as any).checkQueue = async () => {
    console.log('🔍 Checking email queue...')
    try {
      const result = await checkEmailQueue()
      console.log('✅ Queue check complete')
      return result
    } catch (error) {
      console.error('❌ Queue check failed:', error)
      return null
    }
  }
  
  ;(window as any).checkSettings = async (season = 2024) => {
    console.log(`🔍 Checking admin email settings for season ${season}...`)
    try {
      const result = await checkAdminEmailSettings(season)
      console.log('✅ Settings check complete')
      return result
    } catch (error) {
      console.error('❌ Settings check failed:', error)
      return null
    }
  }
  
  // Also add to a namespace for easier access
  ;(window as any).emailTesting = {
    testPickConfirmationEmail: (window as any).testPickConfirmationEmail,
    testAnonymousPickConfirmation: (window as any).testAnonymousPickConfirmation,
    processTestEmailQueue: (window as any).processTestEmailQueue,
    testNotificationScheduling: (window as any).testNotificationScheduling,
    testAllTemplates: (window as any).testAllTemplates,
    checkEmailQueue: (window as any).checkEmailQueue,
    checkAdminEmailSettings: (window as any).checkAdminEmailSettings,
    checkDatabaseEmailSettings: (window as any).checkDatabaseEmailSettings,
    initializeDefaultEmailSettings: (window as any).initializeDefaultEmailSettings,
    clearEmailQueue: (window as any).clearEmailQueue,
    checkQueue: (window as any).checkQueue,
    checkSettings: (window as any).checkSettings
  }
  
  console.log('🧪 Email testing utilities loaded!')
  console.log('📋 Available functions:')
  console.log('  - checkQueue() - Quick email queue check')
  console.log('  - checkSettings(season?) - Quick admin settings check') 
  console.log('  - checkDatabaseEmailSettings(season?) - Check raw database records')
  console.log('  - clearEmailQueue() - Clear all pending emails (DANGER!)')
  console.log('  - checkEmailQueue() - Detailed email queue check')
  console.log('  - checkAdminEmailSettings(season?) - Detailed admin settings check')
  console.log('  - testAllTemplates() - Test all email templates')
  console.log('  - testPickConfirmationEmail("your.email@example.com", "Your Name")')
  console.log('  - testAnonymousPickConfirmation("your.email@example.com", "Your Name")')
  console.log('  - processTestEmailQueue() - Process ALL pending emails (use carefully!)')
  console.log('  - testNotificationScheduling(userId?)')
  console.log('  - Or use emailTesting.checkDatabaseEmailSettings() for namespaced access')
}

// Auto-register functions when module loads
if (typeof window !== 'undefined') {
  registerGlobalEmailTesting()
}