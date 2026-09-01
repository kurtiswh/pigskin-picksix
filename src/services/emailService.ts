/**
 * Email Service
 * Handles email notifications for pick reminders, results, and alerts
 */

import { supabase } from '@/lib/supabase'
import { UserPreferences } from '@/types'
import { ENV } from '@/lib/env'
// Email is sent server-side via the Supabase `send-email` Edge Function (which
// holds the Resend secret); the client never instantiates Resend directly.
import {
  getPickReminderSubject, 
  getPickReminderHtml, 
  getPickReminderText 
} from '@/templates/pickReminder'
import { 
  getDeadlineAlertSubject, 
  getDeadlineAlertHtml, 
  getDeadlineAlertText 
} from '@/templates/deadlineAlert'
import { 
  getWeeklyResultsSubject, 
  getWeeklyResultsHtml, 
  getWeeklyResultsText 
} from '@/templates/weeklyResults'
import { 
  getPicksSubmittedSubject, 
  getPicksSubmittedHtml, 
  getPicksSubmittedText 
} from '@/templates/picksSubmitted'
import { 
  getWeekOpenedSubject, 
  getWeekOpenedHtml, 
  getWeekOpenedText 
} from '@/templates/weekOpened'
import { 
  getPasswordResetSubject, 
  getPasswordResetHtml, 
  getPasswordResetText 
} from '@/templates/passwordReset'

export interface EmailTemplate {
  subject: string
  html: string
  text: string
}

/** Only used when VITE_SUPABASE_URL is missing; the project URL is public. */
const FALLBACK_SUPABASE_URL = 'https://zgdaqbnpgrabbnljmiqy.supabase.co'

export interface EmailJob {
  id: string
  user_id: string
  email: string
  template_type: 'pick_reminder' | 'deadline_alert' | 'weekly_results' | 'game_completed' | 'picks_submitted' | 'week_opened' | 'password_reset'
  subject: string
  html_content: string
  text_content: string
  scheduled_for: string
  status: 'pending' | 'sent' | 'failed'
  attempts: number
  error_message?: string
  created_at: string
  sent_at?: string
}

/**
 * Email template generators
 */
export class EmailTemplates {
  static pickReminder(userDisplayName: string, week: number, season: number, deadline: Date): EmailTemplate {
    const deadlineStr = deadline.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    })

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://pigskin-picksix.vercel.app'
    
    const templateData = {
      userDisplayName,
      week,
      season,
      deadline,
      deadlineStr,
      baseUrl
    }

    return {
      subject: getPickReminderSubject(templateData),
      html: getPickReminderHtml(templateData),
      text: getPickReminderText(templateData)
    }
  }

  static deadlineAlert(userDisplayName: string, week: number, season: number, deadline: Date, hoursLeft: number): EmailTemplate {
    const deadlineStr = deadline.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    })

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://pigskin-picksix.vercel.app'
    
    const templateData = {
      userDisplayName,
      week,
      season,
      deadline,
      deadlineStr,
      hoursLeft,
      baseUrl
    }

    return {
      subject: getDeadlineAlertSubject(templateData),
      html: getDeadlineAlertHtml(templateData),
      text: getDeadlineAlertText(templateData)
    }
  }

  /**
   * Preview-only now: real weekly results are queued by queue_weekly_results and
   * rendered by the Edge Function.
   *
   * It used to take a narrower shape and invent the rest — seasonPoints and
   * seasonRank were filled in from the WEEKLY points and rank, with a comment
   * saying they "would come from a different source in real usage". They did
   * not, so every weekly results email reported the week's figures twice, once
   * labelled as the season. The caller now passes the real six fields (the
   * server reads them from weekly_leaderboard and season_leaderboard) and this
   * fabricates nothing. `record` is not among them: the template derives it
   * from the picks.
   */
  static weeklyResults(
    userDisplayName: string,
    week: number,
    season: number,
    userStats: {
      weeklyPoints: number
      weeklyRank: number
      totalPlayers: number
      seasonPoints: number
      seasonRank: number
      picks: Array<{
        game: string
        pick: string
        result: 'win' | 'loss' | 'push'
        points: number
        isLock: boolean
      }>
    }
  ): EmailTemplate {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://pigskin-picksix.vercel.app'

    const templateData = { userDisplayName, week, season, baseUrl, userStats }

    return {
      subject: getWeeklyResultsSubject(templateData),
      html: getWeeklyResultsHtml(templateData),
      text: getWeeklyResultsText(templateData)
    }
  }

  static picksSubmitted(
    userDisplayName: string, 
    week: number, 
    season: number,
    picks: Array<{
      game: string
      pick: string
      spread: number
      isLock: boolean
      lockTime: string
    }>,
    submittedAt: Date
  ): EmailTemplate {
    const submittedStr = submittedAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    })

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://pigskin-picksix.vercel.app'
    
    const templateData = {
      userDisplayName,
      week,
      season,
      picks,
      submittedAt,
      submittedStr,
      baseUrl
    }

    return {
      subject: getPicksSubmittedSubject(templateData),
      html: getPicksSubmittedHtml(templateData),
      text: getPicksSubmittedText(templateData)
    }
  }

  static weekOpened(week: number, season: number, deadline: Date, totalGames: number): EmailTemplate {
    const deadlineStr = deadline.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric', 
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    })

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://pigskin-picksix.vercel.app'
    
    const templateData = {
      week,
      season,
      deadline,
      deadlineStr,
      totalGames,
      baseUrl
    }

    return {
      subject: getWeekOpenedSubject(templateData),
      html: getWeekOpenedHtml(templateData),
      text: getWeekOpenedText(templateData)
    }
  }


  static passwordReset(userDisplayName: string, resetUrl: string): EmailTemplate {
    const templateData = {
      userDisplayName,
      resetUrl
    }

    return {
      subject: getPasswordResetSubject(templateData),
      html: getPasswordResetHtml(templateData), 
      text: getPasswordResetText(templateData)
    }
  }
}

/**
 * Email service for managing notifications
 */
export class EmailService {
  /**
   * Bearer token for the send-email Edge Function.
   *
   * Prefers the caller's session. The function only accepts an email body from
   * the service role or a signed-in admin — the anon key can do nothing but
   * send a job that was queued for it by an RPC, which is the point — so
   * passing the anon key where a session exists would silently downgrade an
   * admin to no permissions at all.
   */
  private static async edgeFunctionToken(): Promise<string> {
    try {
      const { data } = await supabase.auth.getSession()
      if (data.session?.access_token) return data.session.access_token
    } catch (error) {
      console.warn('Could not read session for Edge Function call:', error)
    }
    return ENV.SUPABASE_ANON_KEY || ''
  }

  /**
   * Queue a pick confirmation server-side and send it.
   *
   * The RPC derives the recipient, the name and every pick from the database;
   * nothing here describes the email. `email` is only needed for anonymous
   * submitters, where it selects whose picks to confirm — and is therefore also
   * the only address the mail can reach.
   */
  static async sendPickConfirmationServerRendered(
    week: number,
    season: number,
    anonymousEmail?: string
  ): Promise<boolean> {
    try {
      // Retry the queue step.
      //
      // A confirmation was lost in production when this RPC never reached
      // Postgres at all (pg_stat_statements recorded zero executions), while
      // the same call nine minutes later succeeded -- the signature of a
      // transient PostgREST rejection: a stale schema cache (PGRST202) or a
      // dropped request. One attempt turned a blip into a silently missing
      // receipt, so try three times before giving up.
      let data: any = null
      let error: any = null

      for (let attempt = 1; attempt <= 3; attempt++) {
        const result = anonymousEmail
          ? await supabase.rpc('queue_anonymous_pick_confirmation', {
              p_email: anonymousEmail,
              p_week: week,
              p_season: season,
            })
          : await supabase.rpc('queue_pick_confirmation', {
              p_week: week,
              p_season: season,
            })
        data = result.data
        error = result.error

        if (!error) break

        // Don't burn retries on a definitive answer: a rate-limit trip or a
        // genuine "no submitted picks" will fail identically every time.
        const permanent = /Too many confirmation emails|No submitted picks|No account found|Must be signed in/i
          .test(error.message ?? '')
        if (permanent) break

        console.warn(`⚠️ queue attempt ${attempt}/3 failed:`, error.message ?? error)
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 750))
      }

      if (error) throw error

      const job = data as { job_id?: string; send_token?: string } | null
      if (!job?.job_id) throw new Error('Confirmation RPC returned no job id')

      console.log(`📧 Pick confirmation queued (job: ${job.job_id})`)
      return await this.sendQueuedJob(job.job_id, job.send_token)
    } catch (error) {
      console.error('❌ Could not queue/send pick confirmation:', error)
      return false
    }
  }

  /**
   * Players whose picks are submitted but who never got a confirmation.
   *
   * The invariant is "submitted picks imply a confirmation job". It can break
   * whenever the browser fails to reach the queueing RPC -- which happened in
   * production and went unnoticed, because processPendingEmails only rescues
   * jobs that already exist. Admin-only; the RPC guards itself.
   */
  static async findMissingPickConfirmations(
    week: number,
    season: number
  ): Promise<Array<{ user_id: string; display_name: string; email: string; submitted_picks: number }>> {
    const { data, error } = await supabase.rpc('find_missing_pick_confirmations', {
      p_week: week,
      p_season: season,
    })
    if (error) throw error
    return (data ?? []) as Array<{
      user_id: string
      display_name: string
      email: string
      submitted_picks: number
    }>
  }

  /**
   * Queue and send the missing confirmations for a week.
   *
   * Each player is independent: one failure must not abandon the rest, so
   * failures are collected and reported rather than thrown.
   */
  static async sendMissingPickConfirmations(
    week: number,
    season: number
  ): Promise<{ sent: number; failed: Array<{ email: string; reason: string }> }> {
    const missing = await this.findMissingPickConfirmations(week, season)
    let sent = 0
    const failed: Array<{ email: string; reason: string }> = []

    for (const person of missing) {
      try {
        const { data, error } = await supabase.rpc('queue_pick_confirmation_for_user', {
          p_user_id: person.user_id,
          p_week: week,
          p_season: season,
        })
        if (error) throw error

        const job = data as { job_id?: string; send_token?: string } | null
        if (!job?.job_id) throw new Error('Queue RPC returned no job id')

        const ok = await this.sendQueuedJob(job.job_id, job.send_token)
        if (ok) {
          sent++
        } else {
          failed.push({ email: person.email, reason: 'Queued but the send failed; job left pending' })
        }
      } catch (err: any) {
        failed.push({ email: person.email, reason: err?.message ?? String(err) })
      }
    }

    return { sent, failed }
  }

  /**
   * Admin preview of the pick-confirmation email.
   *
   * Deliberately separate from sendPickConfirmationServerRendered: that one
   * takes no address and no pick list because it confirms a real submission for
   * the signed-in player. A test has to go somewhere else and render a sample,
   * and routing it through the real path meant it read the admin's own (empty)
   * picks and quietly sent nothing.
   */
  static async sendPickConfirmationTest(
    toEmail: string,
    week: number,
    season: number
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc('queue_pick_confirmation_test', {
      p_to_email: toEmail,
      p_week: week,
      p_season: season,
    })
    if (error) throw error

    const job = data as { job_id?: string; send_token?: string } | null
    if (!job?.job_id) throw new Error('Could not queue the test email')
    return await this.sendQueuedJob(job.job_id, job.send_token)
  }

  // Removed: schedulePickReminder, scheduleDeadlineAlerts, sendWeeklyResults,
  // sendWeekOpenedAnnouncement, getUsersForNotification and its fallback.
  //
  // Each rendered an email in the browser and INSERTed it as finished HTML, one
  // row per user in a loop. Migration 208 replaced them with
  // queue_week_opened_announcement / queue_pick_reminders / queue_weekly_results,
  // which pick the audience and build the payload in a single statement. The
  // audience query in particular was contorted around PostgREST — it batched
  // pick lookups 50 users at a time to stay under URL length limits, a problem
  // that only existed because it ran from a browser.

  /**
   * Send pick confirmation email when user submits picks
   */
  static async sendPickConfirmation(
    userId: string,
    email: string,
    displayName: string,
    week: number,
    season: number,
    picks: Array<{
      game: string
      pick: string
      spread: number
      isLock: boolean
      lockTime: string
    }>,
    submittedAt: Date
  ): Promise<string> {
    try {
      const template = EmailTemplates.picksSubmitted(displayName, week, season, picks, submittedAt)
      
      // Handle anonymous users - set user_id to null for foreign key constraint
      const actualUserId = (userId === 'anonymous' || !userId) ? null : userId
      
      const { data, error } = await supabase
        .from('email_jobs')
        .insert({
          user_id: actualUserId,
          email,
          template_type: 'picks_submitted',
          subject: template.subject,
          html_content: template.html,
          text_content: template.text,
          scheduled_for: new Date().toISOString(), // Send immediately
          status: 'pending',
          attempts: 0
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating email job:', error)
        throw error
      }
      
      console.log(`📧 Queued pick confirmation email for ${email} (user: ${actualUserId || 'anonymous'})`)
      return data.id
    } catch (error) {
      console.error('Error sending pick confirmation:', error)
      throw error
    }
  }

  /**
   * Get all active (paid) users for general notifications like week opened
   * Optimized to avoid URL length issues with large user sets
   */
  static async getActiveUsers(season: number): Promise<Array<{
    id: string
    email: string
    display_name: string
    preferences: UserPreferences
  }>> {
    try {
      // Use a JOIN query to get users with preferences AND payment status in one query
      const { data: usersWithPayments, error: joinError } = await supabase
        .from('users')
        .select(`
          id, 
          email, 
          display_name, 
          preferences,
          leaguesafe_payments!inner(user_id, status)
        `)
        .eq('preferences->>email_notifications', true)
        .eq('leaguesafe_payments.season', season)
        .eq('leaguesafe_payments.status', 'Paid')

      if (joinError) {
        console.error('Join query failed, falling back to batch processing:', joinError)
        // Fallback to batch processing
        return await this.getActiveUsersFallback(season)
      }

      return usersWithPayments || []
      
    } catch (error) {
      console.error('Error getting active users:', error)
      // Try fallback method
      try {
        return await this.getActiveUsersFallback(season)
      } catch (fallbackError) {
        console.error('Fallback method also failed:', fallbackError)
        throw error
      }
    }
  }

  /**
   * Fallback method for getting active users using batched queries
   */
  private static async getActiveUsersFallback(season: number): Promise<Array<{
    id: string
    email: string
    display_name: string
    preferences: UserPreferences
  }>> {
    // Get users with email notifications enabled first
    const { data: allUsers, error: usersError } = await supabase
      .from('users')
      .select('id, email, display_name, preferences')
      .eq('preferences->>email_notifications', true)

    if (usersError) throw usersError
    if (!allUsers || allUsers.length === 0) return []

    // Process users in batches to avoid URL length issues
    const batchSize = 50
    const paidUsers: string[] = []
    
    for (let i = 0; i < allUsers.length; i += batchSize) {
      const batch = allUsers.slice(i, i + batchSize)
      const userIds = batch.map(u => u.id)
      
      const { data: batchPaidUsers, error: paymentsError } = await supabase
        .from('leaguesafe_payments')
        .select('user_id')
        .eq('season', season)
        .eq('status', 'Paid')
        .in('user_id', userIds)

      if (paymentsError) {
        console.error(`Error checking payments for batch starting at ${i}:`, paymentsError)
        continue // Skip this batch rather than fail completely
      }
      
      paidUsers.push(...(batchPaidUsers?.map(p => p.user_id) || []))
    }

    // Filter users to only those who are paid
    const paidUserIds = new Set(paidUsers)
    return allUsers.filter(user => paidUserIds.has(user.id))
  }

  /**
   * Process a specific email job by ID
   */
  static async processPendingEmailById(jobId: string): Promise<boolean> {
    try {
      console.log(`📧 Processing specific email job: ${jobId}`)
      
      // Get the specific job
      const { data: job, error } = await supabase
        .from('email_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('status', 'pending')
        .single()

      if (error) {
        console.error(`❌ Error fetching email job ${jobId}:`, error)
        return false
      }

      if (!job) {
        console.log(`📧 No pending email job found with ID: ${jobId}`)
        return false
      }

      try {
        console.log(`📧 Processing specific email job ${job.id}: ${job.subject} -> ${job.email}`)
        
        const emailSent = await this.sendEmail(job)
        
        if (emailSent) {
          // Mark as sent
          await supabase
            .from('email_jobs')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              attempts: job.attempts + 1
            })
            .eq('id', job.id)
          
          console.log(`✅ Email sent successfully: ${job.id}`)
          return true
        } else {
          throw new Error('Email sending failed')
        }
      } catch (error) {
        console.error(`❌ Error processing email job ${job.id}:`, error)
        
        // Update attempt count and error message
        await supabase
          .from('email_jobs')
          .update({
            status: job.attempts >= 2 ? 'failed' : 'pending',
            attempts: job.attempts + 1,
            error_message: error instanceof Error ? error.message : String(error)
          })
          .eq('id', job.id)
        
        return false
      }
      
    } catch (error) {
      console.error(`❌ Error processing specific email job ${jobId}:`, error)
      return false
    }
  }

  /**
   * Process pending email jobs (would be called by a background job)
   */
  static async processPendingEmails(): Promise<{ processed: number; errors: number }> {
    try {
      console.log('📧 Processing pending email jobs...')
      
      // Get pending jobs that are scheduled for now or earlier
      const { data: pendingJobs, error } = await supabase
        .from('email_jobs')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_for', new Date().toISOString())
        .lt('attempts', 3) // Max 3 retry attempts
        .order('scheduled_for', { ascending: true })
        .limit(50)

      if (error) throw error

      if (!pendingJobs || pendingJobs.length === 0) {
        console.log('📧 No pending emails to process')
        return { processed: 0, errors: 0 }
      }

      let processed = 0
      let errors = 0

      // Process each email job
      for (const job of pendingJobs) {
        try {
          // Here you would integrate with your email provider (SendGrid, AWS SES, etc.)
          // For now, we'll just log the email and mark as sent
          console.log(`📧 Processing email job ${job.id}: ${job.subject} -> ${job.email}`)
          
          // TODO: Replace with actual email sending logic
          const emailSent = await this.sendEmail(job)
          
          if (emailSent) {
            // Mark as sent
            await supabase
              .from('email_jobs')
              .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                attempts: job.attempts + 1
              })
              .eq('id', job.id)
            
            processed++
            console.log(`✅ Email sent successfully: ${job.id}`)
          } else {
            throw new Error('Email sending failed')
          }
        } catch (error) {
          console.error(`❌ Error processing email job ${job.id}:`, error)
          
          // Update attempt count and error message
          await supabase
            .from('email_jobs')
            .update({
              status: job.attempts >= 2 ? 'failed' : 'pending',
              attempts: job.attempts + 1,
              error_message: error instanceof Error ? error.message : String(error)
            })
            .eq('id', job.id)
          
          errors++
        }
      }

      console.log(`📧 Email processing complete: ${processed} sent, ${errors} errors`)
      return { processed, errors }
      
    } catch (error) {
      console.error('Error processing pending emails:', error)
      throw error
    }
  }

  /**
   * Send an already-queued job by id.
   *
   * The Edge Function reads the recipient and body from email_jobs itself and
   * marks the row sent, so nothing here supplies content. Jobs queued by the
   * queue_* RPCs carry a one-time `sendToken`, which is what lets an anonymous
   * visitor send their own confirmation without being able to send anyone
   * else's.
   */
  static async sendQueuedJob(jobId: string, sendToken?: string): Promise<boolean> {
    try {
      const supabaseUrl = ENV.SUPABASE_URL || FALLBACK_SUPABASE_URL
      const token = await this.edgeFunctionToken()

      const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sendToken ? { jobId, sendToken } : { jobId })
      })

      if (response.ok) {
        const result = await response.json()
        console.log(`✅ Queued email ${jobId} sent:`, result?.messageId ?? '(already sent)')
        return true
      }

      const errorText = await response.text()
      console.error(`❌ Sending queued email ${jobId} failed:`, response.status, errorText)
      return false
    } catch (error) {
      console.error(`❌ Exception sending queued email ${jobId}:`, error)
      return false
    }
  }

  /**
   * Send a pending job through the queue processor.
   * Goes out by job id so the server, not this browser, decides the content.
   */
  private static async sendEmail(job: EmailJob): Promise<boolean> {
    console.log(`📧 SENDING EMAIL: ${job.template_type} -> ${job.email}`)
    return await this.sendQueuedJob(job.id)
  }

  // sendPickConfirmationDirect used to render a confirmation in the browser and
  // post the HTML to send-email. That path is gone: use
  // sendPickConfirmationServerRendered, which queues the job through an RPC and
  // lets the server render it from the picks already in the database.

  // Removed: sendEmailDirect.
  //
  // It POSTed a finished subject and HTML body to send-email, which is the one
  // thing no browser should be able to do. Its last two callers were the recap
  // blast and the preseason test; migration 203 moved both behind queue_* RPCs,
  // so send-email now accepts a body from the service role alone. Everything
  // client-side goes through sendQueuedJob() instead.

  // Removed: sendMagicLink, sendPasswordResetViaResend and sendPasswordReset.
  //
  // All three were dead — nothing called them. The first two queued a
  // client-rendered body into email_jobs and then drained the queue to send it,
  // which is exactly the pattern migrations 201/202 exist to stop; they would
  // now be refused by send-email and by the table's INSERT policy. Both were
  // also already broken independently, writing the strings 'magic-link-user'
  // and 'password-reset-user' into email_jobs.user_id, a uuid column.
  //
  // Password resets go through supabase.auth.resetPasswordForEmail (see
  // UserManagement). The magic-link templates survive for the EmailDesigns
  // preview gallery via EmailTemplates.magicLink / .passwordReset.

  /**
   * Cancel a player's pending emails for one week — used when they submit picks,
   * so they stop being reminded about picks they have already made.
   *
   * `season` and `week` were accepted and then ignored until migration 211 gave
   * email_jobs the columns to filter on, so this cancelled a player's pending
   * reminders for every future week, not just this one.
   */
  static async cancelScheduledEmails(
    userId: string,
    templateTypes: string[],
    season: number,
    week: number
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('email_jobs')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .eq('status', 'pending')
        .in('template_type', templateTypes)
        .eq('season', season)
        .eq('week', week)
        .gte('scheduled_for', new Date().toISOString())

      if (error) throw error

      console.log(`📧 Cancelled pending ${templateTypes.join('/')} for user ${userId}, week ${week} of ${season}`)
    } catch (error) {
      console.error('Error cancelling scheduled emails:', error)
      throw error
    }
  }
}

// Make EmailService available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).EmailService = EmailService
  console.log('🛠️ EmailService available globally for debugging. Try: EmailService.processPendingEmails()')
}