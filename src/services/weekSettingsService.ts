import { supabase } from '@/lib/supabase'

export interface WeekSettings {
  id: string
  week: number
  season: number
  games_selected: boolean
  picks_open: boolean
  games_locked: boolean
  deadline: string
  scoring_complete: boolean
  leaderboard_complete: boolean
  admin_custom_message: string | null
  created_at: string
  updated_at: string
}

export class WeekSettingsService {
  static async getWeekSettings(season: number, week: number): Promise<WeekSettings | null> {
    try {
      const { data, error } = await supabase
        .from('week_settings')
        .select('*')
        .eq('season', season)
        .eq('week', week)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return null // No record found
        }
        throw error
      }

      return data
    } catch (error) {
      console.error('Error fetching week settings:', error)
      return null
    }
  }

  static async updateCompletionStatus(
    season: number, 
    week: number, 
    updates: {
      scoring_complete?: boolean
      leaderboard_complete?: boolean
      admin_custom_message?: string | null
    }
  ): Promise<WeekSettings | null> {
    try {
      const { data, error } = await supabase
        .from('week_settings')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('season', season)
        .eq('week', week)
        .select()
        .single()

      if (error) throw error

      return data
    } catch (error) {
      console.error('Error updating week settings completion status:', error)
      throw error
    }
  }

  static async createWeekSettingsIfNotExists(
    season: number, 
    week: number, 
    deadline: string
  ): Promise<WeekSettings> {
    try {
      // First try to get existing settings
      let settings = await this.getWeekSettings(season, week)
      
      if (!settings) {
        // Create new week settings with default values
        const { data, error } = await supabase
          .from('week_settings')
          .insert({
            season,
            week,
            deadline,
            games_selected: false,
            picks_open: false,
            games_locked: false,
            scoring_complete: false,
            leaderboard_complete: false,
            admin_custom_message: null
          })
          .select()
          .single()

        if (error) throw error
        settings = data
      }

      return settings
    } catch (error) {
      console.error('Error creating week settings:', error)
      throw error
    }
  }

  static getNoticeMessage(
    weekSettings: WeekSettings | null,
    isLiveUpdating: boolean
  ): {
    message: string
    type: 'experimental' | 'final' | 'default'
  } {
    // If no week settings, show default message
    if (!weekSettings) {
      return {
        message: 'IF YOU SEE SOMETHING WRONG WITH THE LEADERBOARD, PLEASE EMAIL US AT ADMIN@PIGSKINPICKSIX.COM.',
        type: 'default'
      }
    }

    // If both scoring and leaderboard are complete, show final message
    if (weekSettings.scoring_complete && weekSettings.leaderboard_complete) {
      let message = 'SCORING AND LEADERBOARD ARE COMPLETE AND VALIDATED. '
      
      if (weekSettings.admin_custom_message) {
        message += weekSettings.admin_custom_message + ' '
      }
      
      message += 'IF YOU SEE ANY ERRORS, PLEASE EMAIL US AT ADMIN@PIGSKINPICKSIX.COM.'
      
      return {
        message,
        type: 'final'
      }
    }

    // If live updating or scoring not complete, show experimental message
    if (isLiveUpdating || !weekSettings.scoring_complete || !weekSettings.leaderboard_complete) {
      let message = 'LIVE SCORING/LEADERBOARD IS EXPERIMENTAL AND ALL RESULTS MAY NOT BE ACCURATE. RESULTS AREN\'T FINAL UNTIL REVIEW AND VALIDATION BY AN ADMIN. '
      
      if (weekSettings.admin_custom_message) {
        message += weekSettings.admin_custom_message + ' '
      }
      
      message += 'THIS HEADER WILL REFLECT WHEN RESULTS ARE CONFIRMED.'
      
      return {
        message,
        type: 'experimental'
      }
    }

    // Default fallback
    return {
      message: 'IF YOU SEE SOMETHING WRONG WITH THE LEADERBOARD, PLEASE EMAIL US AT ADMIN@PIGSKINPICKSIX.COM.',
      type: 'default'
    }
  }
}