/**
 * Template data interfaces for email templates
 */

export interface BaseTemplateData {
  userDisplayName: string
  week: number
  season: number
  baseUrl: string
}

export interface PickReminderData extends BaseTemplateData {
  deadline: Date
  deadlineStr: string
}

export interface DeadlineAlertData extends BaseTemplateData {
  deadline: Date
  deadlineStr: string
  hoursLeft: number
}

export interface PicksSubmittedData extends BaseTemplateData {
  picks: Array<{
    game: string
    pick: string
    spread: number
    isLock: boolean
    lockTime: string
  }>
  submittedAt: Date
  submittedStr: string
}

export interface WeeklyResultsData extends BaseTemplateData {
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
}

export interface WeekOpenedData {
  week: number
  season: number
  deadline: Date
  deadlineStr: string
  totalGames: number
  baseUrl: string
}

export interface MagicLinkData {
  userDisplayName: string
  magicLinkUrl: string
}

export interface PasswordResetData {
  userDisplayName: string
  resetUrl: string
}