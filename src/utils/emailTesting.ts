/**
 * Email Testing Utilities
 * Console-based testing functions for email confirmation system
 */

import { EmailService } from '@/services/emailService'
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
    
    console.log('✅ Pick confirmation email queued successfully!')
    console.log('📧 Email details:')
    console.log(`  To: ${testEmail}`)
    console.log(`  Name: ${testName}`)
    console.log(`  Picks: ${mockPicks.length} games with 1 lock pick`)
    console.log('📋 Next step: Call processTestEmailQueue() to send the email')
    
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

// Make functions available globally for console testing
if (typeof window !== 'undefined') {
  // Ensure window properties exist
  (window as any).testPickConfirmationEmail = testPickConfirmationEmail
  (window as any).testAnonymousPickConfirmation = testAnonymousPickConfirmation
  (window as any).processTestEmailQueue = processTestEmailQueue
  (window as any).testNotificationScheduling = testNotificationScheduling
  
  // Also add to a namespace for easier access
  ;(window as any).emailTesting = {
    testPickConfirmationEmail,
    testAnonymousPickConfirmation,
    processTestEmailQueue,
    testNotificationScheduling
  }
  
  console.log('🧪 Email testing utilities loaded!')
  console.log('📋 Available functions:')
  console.log('  - testPickConfirmationEmail("your.email@example.com", "Your Name")')
  console.log('  - testAnonymousPickConfirmation("your.email@example.com", "Your Name")')
  console.log('  - processTestEmailQueue()')
  console.log('  - testNotificationScheduling()')
  console.log('  - Or use emailTesting.processTestEmailQueue() for namespaced access')
  
  // Force registration after a short delay to ensure DOM is ready
  setTimeout(() => {
    if (!(window as any).processTestEmailQueue) {
      (window as any).processTestEmailQueue = processTestEmailQueue
      console.log('🔄 Re-registered processTestEmailQueue function')
    }
  }, 1000)
}