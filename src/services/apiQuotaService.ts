/**
 * API Quota Management Service
 * 
 * Manages College Football Data API quota usage
 * 5,000 calls per month budget
 */

interface QuotaUsage {
  month: string // YYYY-MM format
  totalCalls: number
  lastReset: Date
  dailyUsage: { [date: string]: number }
}

export class ApiQuotaService {
  private static readonly MONTHLY_LIMIT = 5000
  private static readonly STORAGE_KEY = 'cfbd-api-quota'
  
  /**
   * Get current month quota usage
   */
  static getCurrentQuota(): QuotaUsage {
    const currentMonth = new Date().toISOString().slice(0, 7) // YYYY-MM
    
    const stored = localStorage.getItem(this.STORAGE_KEY)
    let quota: QuotaUsage = stored ? JSON.parse(stored) : {
      month: currentMonth,
      totalCalls: 0,
      lastReset: new Date(),
      dailyUsage: {}
    }
    
    // Reset if new month
    if (quota.month !== currentMonth) {
      quota = {
        month: currentMonth,
        totalCalls: 0,
        lastReset: new Date(),
        dailyUsage: {}
      }
      this.saveQuota(quota)
    }
    
    return quota
  }
  
  /**
   * Record API call usage
   */
  static recordApiCall(callCount: number = 1): void {
    const quota = this.getCurrentQuota()
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    
    quota.totalCalls += callCount
    quota.dailyUsage[today] = (quota.dailyUsage[today] || 0) + callCount
    
    this.saveQuota(quota)
    
    // Log warnings for high usage
    const percentUsed = (quota.totalCalls / this.MONTHLY_LIMIT) * 100
    if (percentUsed >= 90) {
      console.warn(`🚨 API Quota Warning: ${percentUsed.toFixed(1)}% used (${quota.totalCalls}/${this.MONTHLY_LIMIT})`)
    } else if (percentUsed >= 75) {
      console.warn(`⚠️ API Quota Alert: ${percentUsed.toFixed(1)}% used (${quota.totalCalls}/${this.MONTHLY_LIMIT})`)
    }
  }
  
  /**
   * Check if API call is within quota
   */
  static canMakeApiCall(requestedCalls: number = 1): { allowed: boolean; reason?: string } {
    const quota = this.getCurrentQuota()
    const remaining = this.MONTHLY_LIMIT - quota.totalCalls
    
    if (remaining < requestedCalls) {
      return {
        allowed: false,
        reason: `Monthly quota exceeded. ${quota.totalCalls}/${this.MONTHLY_LIMIT} calls used this month.`
      }
    }
    
    // Additional check: prevent excessive daily usage
    const today = new Date().toISOString().slice(0, 10)
    const todayUsage = quota.dailyUsage[today] || 0
    const DAILY_LIMIT = 200 // Conservative daily limit
    
    if (todayUsage + requestedCalls > DAILY_LIMIT) {
      return {
        allowed: false,
        reason: `Daily usage limit reached. ${todayUsage}/${DAILY_LIMIT} calls used today.`
      }
    }
    
    return { allowed: true }
  }
  
  /**
   * Get quota status summary
   */
  static getQuotaStatus(): {
    monthlyUsed: number
    monthlyLimit: number
    monthlyRemaining: number
    percentUsed: number
    dailyUsage: number
    recommendedCallsRemaining: number
  } {
    const quota = this.getCurrentQuota()
    const today = new Date().toISOString().slice(0, 10)
    const dailyUsage = quota.dailyUsage[today] || 0
    
    // Calculate days remaining in month
    const now = new Date()
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const daysRemaining = Math.max(1, endOfMonth.getDate() - now.getDate())
    
    const monthlyRemaining = this.MONTHLY_LIMIT - quota.totalCalls
    const recommendedCallsRemaining = Math.floor(monthlyRemaining / daysRemaining)
    
    return {
      monthlyUsed: quota.totalCalls,
      monthlyLimit: this.MONTHLY_LIMIT,
      monthlyRemaining,
      percentUsed: (quota.totalCalls / this.MONTHLY_LIMIT) * 100,
      dailyUsage,
      recommendedCallsRemaining: Math.max(0, recommendedCallsRemaining)
    }
  }
  
  /**
   * Save quota to localStorage
   */
  private static saveQuota(quota: QuotaUsage): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(quota))
  }
  
  /**
   * Reset quota (admin only - for testing)
   */
  static resetQuota(): void {
    localStorage.removeItem(this.STORAGE_KEY)
    console.log('🔄 API quota reset')
  }
}