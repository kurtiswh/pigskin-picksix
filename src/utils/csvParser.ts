export interface LeagueSafeEntry {
  Owner: string
  OwnerEmail: string
  EntryFeeDisplay: string
  EntryFee: string
  PaidDisplay: string
  Paid: string
  PendingDisplay: string
  Pending: string
  OwesDisplay: string
  Owes: string
  Status: string
  IsCommish: string
  OwnerId: string
}

export function parseLeagueSafeCSV(csvText: string): LeagueSafeEntry[] {
  const lines = csvText.trim().split('\n')
  
  if (lines.length === 0) {
    throw new Error('CSV file is empty')
  }

  // Parse header line
  const headerLine = lines[0]
  const headers = parseCSVLine(headerLine)
  
  if (!headers.includes('Owner') || !headers.includes('OwnerEmail')) {
    throw new Error('Invalid CSV format. Missing required columns: Owner, OwnerEmail')
  }

  // Parse data lines
  const entries: LeagueSafeEntry[] = []
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue // Skip empty lines
    
    try {
      const values = parseCSVLine(line)
      
      // Create entry object
      const entry: any = {}
      headers.forEach((header, index) => {
        entry[header] = values[index] || ''
      })
      
      // Validate required fields
      if (!entry.Owner?.trim() || !entry.OwnerEmail?.trim()) {
        console.warn(`Skipping entry on line ${i + 1}: missing Owner or OwnerEmail`)
        continue
      }
      
      entries.push(entry as LeagueSafeEntry)
    } catch (error) {
      console.warn(`Error parsing line ${i + 1}: ${error}`)
      continue
    }
  }
  
  return entries
}

function parseCSVLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0
  
  while (i < line.length) {
    const char = line[i]
    
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        // Handle escaped quotes ("") within quoted fields
        current += '"'
        i += 2
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
        i++
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      values.push(current.trim())
      current = ''
      i++
    } else {
      current += char
      i++
    }
  }
  
  // Add the last field
  values.push(current.trim())
  
  return values
}

export function validateLeagueSafeEntry(entry: LeagueSafeEntry): string[] {
  const errors: string[] = []
  
  if (!entry.Owner?.trim()) {
    errors.push('Missing Owner name')
  }
  
  if (!entry.OwnerEmail?.trim()) {
    errors.push('Missing Owner email')
  } else {
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(entry.OwnerEmail.trim())) {
      errors.push('Invalid email format')
    }
  }
  
  if (!['Paid', 'NotPaid', 'Pending'].includes(entry.Status)) {
    errors.push(`Invalid status: ${entry.Status}`)
  }
  
  return errors
}

export function cleanLeagueSafeEntry(entry: LeagueSafeEntry): {
  name: string
  email: string
  status: string
  entryFee: number
  paid: number
  pending: number
  owes: number
  isCommish: boolean
} {
  return {
    name: entry.Owner?.trim() || '',
    email: entry.OwnerEmail?.toLowerCase().trim() || '',
    status: entry.Status || 'NotPaid',
    entryFee: parseFloat(entry.EntryFee || '0'),
    paid: parseFloat(entry.Paid || '0'),
    pending: parseFloat(entry.Pending || '0'),
    owes: parseFloat(entry.Owes || '0'),
    isCommish: entry.IsCommish === 'True'
  }
}