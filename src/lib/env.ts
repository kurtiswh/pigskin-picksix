/**
 * Environment variable helper with fallbacks for production builds
 */

// Helper function to get environment variables with multiple fallback methods
function getEnvVar(key: string): string | undefined {
  // Method 1: Standard Vite import.meta.env
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  
  // Method 2: Process.env (might be available in some build configs)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  
  // Method 3: Custom defined constants (from vite.config.ts)
  const globalKey = `__${key}__` as keyof typeof globalThis;
  if (typeof globalThis[globalKey] === 'string') {
    return globalThis[globalKey] as string;
  }
  
  // Method 4: Window object (if set by build process)
  if (typeof window !== 'undefined' && (window as any).__ENV__ && (window as any).__ENV__[key]) {
    return (window as any).__ENV__[key];
  }
  
  return undefined;
}

// Export environment variables with fallbacks
export const ENV = {
  SUPABASE_URL: getEnvVar('VITE_SUPABASE_URL'),
  SUPABASE_ANON_KEY: getEnvVar('VITE_SUPABASE_ANON_KEY'),
  CFBD_API_KEY: getEnvVar('VITE_CFBD_API_KEY'),
  RESEND_API_KEY: getEnvVar('VITE_RESEND_API_KEY'),
} as const;

// Validation helper
export function validateRequiredEnvVars(): { valid: boolean; missing: string[] } {
  const required = [
    { key: 'VITE_SUPABASE_URL', value: ENV.SUPABASE_URL },
    { key: 'VITE_SUPABASE_ANON_KEY', value: ENV.SUPABASE_ANON_KEY },
  ];
  
  const missing = required
    .filter(({ value }) => !value)
    .map(({ key }) => key);
  
  return {
    valid: missing.length === 0,
    missing
  };
}