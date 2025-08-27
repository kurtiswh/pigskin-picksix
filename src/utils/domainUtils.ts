/**
 * Domain and URL utilities for handling authentication redirects
 * Addresses www/non-www mismatches that cause 403 errors
 */

export interface DomainInfo {
  protocol: string
  hostname: string
  port: string
  hasWww: boolean
  domain: string
  fullUrl: string
}

/**
 * Parse a URL into domain information
 */
export function parseDomain(url: string): DomainInfo {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname
    const hasWww = hostname.startsWith('www.')
    const domain = hasWww ? hostname.substring(4) : hostname
    
    return {
      protocol: urlObj.protocol,
      hostname,
      port: urlObj.port,
      hasWww,
      domain,
      fullUrl: url
    }
  } catch (error) {
    console.error('Error parsing domain:', url, error)
    return {
      protocol: 'https:',
      hostname: 'pigskinpicksix.com',
      port: '',
      hasWww: false,
      domain: 'pigskinpicksix.com',
      fullUrl: 'https://pigskinpicksix.com'
    }
  }
}

/**
 * Get both www and non-www versions of a URL
 */
export function getDomainVariants(url: string): { www: string; nonWww: string } {
  const info = parseDomain(url)
  const baseUrl = `${info.protocol}//${info.port ? `:${info.port}` : ''}`
  
  return {
    www: `${info.protocol}//www.${info.domain}${info.port ? `:${info.port}` : ''}`,
    nonWww: `${info.protocol}//${info.domain}${info.port ? `:${info.port}` : ''}`
  }
}

/**
 * Normalize a domain (remove www if present)
 */
export function normalizeDomain(hostname: string): string {
  return hostname.startsWith('www.') ? hostname.substring(4) : hostname
}

/**
 * Check if two URLs belong to the same domain (ignoring www)
 */
export function isSameDomain(url1: string, url2: string): boolean {
  try {
    const info1 = parseDomain(url1)
    const info2 = parseDomain(url2)
    return info1.domain === info2.domain
  } catch {
    return false
  }
}

/**
 * Get the current site URL with proper domain handling
 */
export function getCurrentSiteUrl(): string {
  if (typeof window === 'undefined') {
    // Server-side fallback
    return 'https://www.pigskinpicksix.com'
  }
  
  return window.location.origin
}

/**
 * Get all possible redirect URLs for password reset
 * Addresses the 403 "token not found" error by ensuring all domain variants are covered
 */
export function getPasswordResetRedirectUrls(basePath: string = '/reset-password'): string[] {
  const currentUrl = getCurrentSiteUrl()
  const variants = getDomainVariants(currentUrl)
  
  return [
    `${variants.www}${basePath}`,
    `${variants.nonWww}${basePath}`,
    // Development URLs
    'http://localhost:5173/reset-password',
    'http://localhost:5174/reset-password',
    'http://127.0.0.1:3000/reset-password'
  ]
}

/**
 * Get the preferred redirect URL for password reset
 * Uses the same domain as the current page to avoid mismatches
 */
export function getPasswordResetRedirectUrl(): string {
  const currentUrl = getCurrentSiteUrl()
  return `${currentUrl}/reset-password`
}

/**
 * Check if a URL is likely a valid redirect URL for our domain
 */
export function isValidRedirectUrl(url: string): boolean {
  try {
    const info = parseDomain(url)
    const normalizedDomain = normalizeDomain(info.hostname)
    
    // Allow our production domain
    if (normalizedDomain === 'pigskinpicksix.com') return true
    
    // Allow localhost and 127.0.0.1 for development
    if (normalizedDomain === 'localhost' || normalizedDomain === '127.0.0.1') return true
    
    return false
  } catch {
    return false
  }
}

/**
 * Debug helper to log domain information
 */
export function debugDomainInfo(label: string, url?: string) {
  const targetUrl = url || getCurrentSiteUrl()
  const info = parseDomain(targetUrl)
  const variants = getDomainVariants(targetUrl)
  
  console.log(`🌐 [DOMAIN-${label}] URL Analysis:`, {
    original: targetUrl,
    parsed: info,
    variants,
    redirectUrls: getPasswordResetRedirectUrls(),
    preferredRedirect: getPasswordResetRedirectUrl()
  })
}