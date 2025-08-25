/**
 * Admin Email Settings Service
 * Handles CRUD operations for admin-configurable email notification settings
 */

import { supabase } from '@/lib/supabase'

export interface ReminderSetting {
  name: string
  hours_before_deadline: number
  enabled: boolean
}

export interface ReminderScheduleSettings {
  enabled: boolean
  reminders: ReminderSetting[]
}

export interface OpenPicksSettings {
  enabled: boolean
  send_immediately: boolean
  include_total_games: boolean
}

export interface WeeklyResultsSettings {
  enabled: boolean
  manual_only: boolean
}

export interface AdminEmailSettings {
  reminder_schedule: ReminderScheduleSettings
  open_picks_notifications: OpenPicksSettings
  weekly_results: WeeklyResultsSettings
}

export class AdminEmailSettingsService {
  
  /**
   * Get all email settings for a season
   */
  static async getEmailSettings(season: number): Promise<AdminEmailSettings> {
    try {
      const { data, error } = await supabase
        .from('admin_email_settings')
        .select('setting_key, setting_value')
        .eq('season', season)

      if (error) throw error

      // Convert to typed object
      const settings: Partial<AdminEmailSettings> = {}
      
      for (const setting of data || []) {
        settings[setting.setting_key as keyof AdminEmailSettings] = setting.setting_value
      }

      // Return with defaults if any settings are missing
      return {
        reminder_schedule: settings.reminder_schedule || {
          enabled: true,
          reminders: [
            { name: "48 Hour Reminder", hours_before_deadline: 48, enabled: true },
            { name: "24 Hour Reminder", hours_before_deadline: 24, enabled: true },
            { name: "Final Reminder", hours_before_deadline: 2, enabled: true }
          ]
        },
        open_picks_notifications: settings.open_picks_notifications || {
          enabled: true,
          send_immediately: true,
          include_total_games: true
        },
        weekly_results: settings.weekly_results || {
          enabled: true,
          manual_only: true
        }
      }
    } catch (error) {
      console.error('Error fetching email settings:', error)
      throw error
    }
  }

  /**
   * Update reminder schedule settings
   */
  static async updateReminderSchedule(season: number, settings: ReminderScheduleSettings): Promise<void> {
    try {
      const { error } = await supabase
        .from('admin_email_settings')
        .upsert({
          season,
          setting_key: 'reminder_schedule',
          setting_value: settings,
          created_by: (await supabase.auth.getUser()).data.user?.id
        }, {
          onConflict: 'season,setting_key'
        })

      if (error) throw error
      console.log('✅ Reminder schedule updated')
    } catch (error) {
      console.error('Error updating reminder schedule:', error)
      throw error
    }
  }

  /**
   * Update open picks notification settings
   */
  static async updateOpenPicksSettings(season: number, settings: OpenPicksSettings): Promise<void> {
    try {
      const { error } = await supabase
        .from('admin_email_settings')
        .upsert({
          season,
          setting_key: 'open_picks_notifications',
          setting_value: settings,
          created_by: (await supabase.auth.getUser()).data.user?.id
        }, {
          onConflict: 'season,setting_key'
        })

      if (error) throw error
      console.log('✅ Open picks settings updated')
    } catch (error) {
      console.error('Error updating open picks settings:', error)
      throw error
    }
  }

  /**
   * Update weekly results settings
   */
  static async updateWeeklyResultsSettings(season: number, settings: WeeklyResultsSettings): Promise<void> {
    try {
      const { error } = await supabase
        .from('admin_email_settings')
        .upsert({
          season,
          setting_key: 'weekly_results',
          setting_value: settings,
          created_by: (await supabase.auth.getUser()).data.user?.id
        }, {
          onConflict: 'season,setting_key'
        })

      if (error) throw error
      console.log('✅ Weekly results settings updated')
    } catch (error) {
      console.error('Error updating weekly results settings:', error)
      throw error
    }
  }

  /**
   * Get enabled reminder times for a season (used by NotificationScheduler)
   */
  static async getEnabledReminderTimes(season: number): Promise<number[]> {
    try {
      const settings = await this.getEmailSettings(season)
      
      if (!settings.reminder_schedule.enabled) {
        return []
      }

      return settings.reminder_schedule.reminders
        .filter(reminder => reminder.enabled)
        .map(reminder => reminder.hours_before_deadline)
        .sort((a, b) => b - a) // Sort descending (48h, 24h, 2h)
    } catch (error) {
      console.error('Error getting reminder times:', error)
      // Return default times if error
      return [48, 24, 2]
    }
  }

  /**
   * Check if open picks notifications are enabled
   */
  static async isOpenPicksNotificationEnabled(season: number): Promise<boolean> {
    try {
      const settings = await this.getEmailSettings(season)
      return settings.open_picks_notifications.enabled
    } catch (error) {
      console.error('Error checking open picks notification setting:', error)
      return true // Default to enabled
    }
  }

  /**
   * Check if weekly results should be sent automatically (always false now - manual only)
   */
  static async isWeeklyResultsAutoSendEnabled(season: number): Promise<boolean> {
    try {
      const settings = await this.getEmailSettings(season)
      // With manual_only approach, never auto-send (always return false)
      return settings.weekly_results.enabled && !settings.weekly_results.manual_only
    } catch (error) {
      console.error('Error checking weekly results setting:', error)
      return false // Default to manual only
    }
  }
  
  /**
   * Check if weekly results feature is enabled for manual sending
   */
  static async isWeeklyResultsEnabled(season: number): Promise<boolean> {
    try {
      const settings = await this.getEmailSettings(season)
      return settings.weekly_results.enabled
    } catch (error) {
      console.error('Error checking weekly results setting:', error)
      return true // Default to enabled
    }
  }
}