// UUID generation utility
// Fallback for environments where crypto.randomUUID() might not be available

export function generateUUID(): string {
  // Try crypto.randomUUID() first (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  
  // Try crypto.getRandomValues if available
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return uuidV4WithCrypto()
  }
  
  // Final fallback to Math.random
  return uuidV4WithMath()
}

function uuidV4WithCrypto(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  
  // Set version (4) and variant bits
  array[6] = (array[6] & 0x0f) | 0x40
  array[8] = (array[8] & 0x3f) | 0x80
  
  const hex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function uuidV4WithMath(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c == 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}