import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface ImportedPick {
  user_email: string
  display_name: string
  week: number
  season: number
  game_matchup: string
  home_team: string
  away_team: string
  selected_team: string
  is_lock: boolean
  result?: 'win' | 'loss' | 'push'
  points_earned?: number
  pick_datetime?: string
  home_score?: number
  away_score?: number
  spread?: number
  kickoff_time?: string
}

interface ValidationError {
  row: number
  field: string
  message: string
  data?: any
}

// Helper functions for validation
const isValidDate = (dateString: string): boolean => {
  const regex = /^\d{4}-\d{2}-\d{2}$/
  if (!regex.test(dateString)) return false
  const date = new Date(dateString)
  return date instanceof Date && !isNaN(date.getTime())
}

const isValidDateTime = (dateTimeString: string): boolean => {
  try {
    // Handle space-separated format (YYYY-MM-DD HH:mm:ss) by converting to ISO
    let normalizedDateTime = dateTimeString
    if (dateTimeString.includes(' ') && !dateTimeString.includes('T')) {
      normalizedDateTime = dateTimeString.replace(' ', 'T')
    }
    
    const date = new Date(normalizedDateTime)
    return date instanceof Date && !isNaN(date.getTime())
  } catch {
    return false
  }
}

// Robust CSV parsing function
const parseCSVLine = (line: string): string[] => {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0
  
  while (i < line.length) {
    const char = line[i]
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Handle escaped quotes ("")
        current += '"'
        i += 2
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
        i++
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator outside quotes
      result.push(current.trim())
      current = ''
      i++
    } else {
      current += char
      i++
    }
  }
  
  // Add final field
  result.push(current.trim())
  return result
}

// Safe column value getter
const getColumnValue = (values: string[], headers: string[], columnName: string): string => {
  const index = headers.indexOf(columnName)
  if (index === -1) {
    console.warn(`Column "${columnName}" not found in headers:`, headers)
    return ''
  }
  if (index >= values.length) {
    console.warn(`Column "${columnName}" index ${index} exceeds values length ${values.length}`)
    return ''
  }
  return values[index] || ''
}

export default function HistoricalPicksImport() {
  const [uploading, setUploading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [importData, setImportData] = useState<ImportedPick[]>([])
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [importResults, setImportResults] = useState<{
    success: number
    errors: number
    details: string[]
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    setImportData([])
    setValidationErrors([])
    setImportResults(null)

    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      
      if (lines.length === 0) {
        throw new Error('File is empty')
      }

      // Parse CSV with improved parsing
      const headers = parseCSVLine(lines[0])
      console.log('📋 CSV Headers found:', headers)
      
      const data: ImportedPick[] = []
      const parseErrors: ValidationError[] = []

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i])
        if (values.length === 0 || values.every(v => !v)) continue // Skip empty rows

        // Debug output for problematic rows
        if (values.length !== headers.length) {
          console.warn(`Row ${i + 1}: Expected ${headers.length} columns, got ${values.length}`, values)
          parseErrors.push({
            row: i + 1,
            field: 'csv_structure',
            message: `Column count mismatch: Expected ${headers.length} columns, got ${values.length}. Check for unescaped commas or missing quotes.`
          })
        }

        const pick: ImportedPick = {
          user_email: getColumnValue(values, headers, 'user_email'),
          display_name: getColumnValue(values, headers, 'display_name'),
          week: parseInt(getColumnValue(values, headers, 'week') || '0'),
          season: parseInt(getColumnValue(values, headers, 'season') || '0'),
          game_matchup: getColumnValue(values, headers, 'game_matchup'),
          home_team: getColumnValue(values, headers, 'home_team'),
          away_team: getColumnValue(values, headers, 'away_team'),
          selected_team: getColumnValue(values, headers, 'selected_team'),
          is_lock: getColumnValue(values, headers, 'is_lock')?.toLowerCase() === 'true',
          result: getColumnValue(values, headers, 'result') as 'win' | 'loss' | 'push' | undefined,
          points_earned: getColumnValue(values, headers, 'points_earned') ? parseInt(getColumnValue(values, headers, 'points_earned')) : undefined,
          pick_datetime: getColumnValue(values, headers, 'pick_datetime') || undefined,
          home_score: getColumnValue(values, headers, 'home_score') ? parseInt(getColumnValue(values, headers, 'home_score')) : undefined,
          away_score: getColumnValue(values, headers, 'away_score') ? parseInt(getColumnValue(values, headers, 'away_score')) : undefined,
          spread: getColumnValue(values, headers, 'spread') ? parseFloat(getColumnValue(values, headers, 'spread')) : undefined,
          kickoff_time: getColumnValue(values, headers, 'kickoff_time') || undefined
        }

        // Debug output for data validation
        console.log(`Row ${i + 1}:`, {
          user_email: pick.user_email,
          week: pick.week,
          season: pick.season,
          selected_team: pick.selected_team,
          result: pick.result
        })

        data.push(pick)
      }

      setImportData(data)
      setValidationErrors(parseErrors) // Show any parsing errors immediately
      
      console.log(`📊 Loaded ${data.length} picks from CSV`)
      console.log('🔍 Header mapping check:', {
        totalHeaders: headers.length,
        foundColumns: {
          user_email: headers.indexOf('user_email') !== -1,
          week: headers.indexOf('week') !== -1,
          season: headers.indexOf('season') !== -1,
          selected_team: headers.indexOf('selected_team') !== -1,
          result: headers.indexOf('result') !== -1
        }
      })
      
      // Show first data row for debugging
      if (data.length > 0 && lines.length > 1) {
        console.log('🔍 First row raw data:', lines[1])
        console.log('🔍 First row parsed values:', parseCSVLine(lines[1]))
        console.log('🔍 First row processed pick:', data[0])
      }
      
    } catch (error: any) {
      console.error('Error reading file:', error)
      setValidationErrors([{
        row: 0,
        field: 'file',
        message: `Error reading file: ${error.message}`
      }])
    } finally {
      setUploading(false)
    }
  }

  const validateData = async () => {
    if (importData.length === 0) return

    setValidating(true)
    const errors: ValidationError[] = []

    try {
      // Get all users to validate emails
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, email, display_name')

      if (usersError) throw usersError

      // Get all games to validate matchups
      const { data: games, error: gamesError } = await supabase
        .from('games')
        .select('id, home_team, away_team, week, season')

      if (gamesError) throw gamesError

      // Validate each pick
      importData.forEach((pick, index) => {
        const row = index + 2 // +2 because index is 0-based and row 1 is headers

        // Validate required fields
        if (!pick.user_email) {
          errors.push({ row, field: 'user_email', message: 'User email is required' })
        }
        if (!pick.week || pick.week < 1 || pick.week > 18) {
          errors.push({ row, field: 'week', message: 'Week must be between 1 and 18' })
        }
        if (!pick.season || pick.season < 2020 || pick.season > 2030) {
          errors.push({ row, field: 'season', message: 'Season must be between 2020 and 2030' })
        }
        if (!pick.home_team) {
          errors.push({ row, field: 'home_team', message: 'Home team is required' })
        }
        if (!pick.away_team) {
          errors.push({ row, field: 'away_team', message: 'Away team is required' })
        }
        if (!pick.selected_team) {
          errors.push({ row, field: 'selected_team', message: 'Selected team is required' })
        }

        // Validate selected team is either home or away
        if (pick.selected_team && pick.home_team && pick.away_team) {
          if (pick.selected_team !== pick.home_team && pick.selected_team !== pick.away_team) {
            errors.push({ 
              row, 
              field: 'selected_team', 
              message: `Selected team "${pick.selected_team}" must be either home team "${pick.home_team}" or away team "${pick.away_team}"` 
            })
          }
        }

        // Note: Users will be created automatically during import if they don't exist
        // So we don't need to validate user existence here anymore

        // Validate or prepare game data
        let game = games?.find(g => 
          g.week === pick.week && 
          g.season === pick.season &&
          g.home_team === pick.home_team &&
          g.away_team === pick.away_team
        )
        
        // If game doesn't exist, we'll create it during import (with the new data)
        if (!game && (!pick.home_team || !pick.away_team)) {
          errors.push({ 
            row, 
            field: 'game_matchup', 
            message: `Game not found and insufficient data to create: need home_team and away_team for week ${pick.week}, season ${pick.season}`,
            data: pick
          })
        }

        // Validate result if provided
        if (pick.result && !['win', 'loss', 'push'].includes(pick.result)) {
          errors.push({ row, field: 'result', message: 'Result must be "win", "loss", or "push"' })
        }

        // Validate points if provided
        if (pick.points_earned !== undefined && (pick.points_earned < 0 || pick.points_earned > 50)) {
          errors.push({ row, field: 'points_earned', message: 'Points earned must be between 0 and 50' })
        }

        // Validate datetime if provided
        if (pick.pick_datetime && !isValidDateTime(pick.pick_datetime)) {
          errors.push({ row, field: 'pick_datetime', message: 'Pick datetime must be in ISO format (YYYY-MM-DDTHH:mm:ss) or YYYY-MM-DD HH:mm:ss' })
        }
        if (pick.kickoff_time && !isValidDateTime(pick.kickoff_time)) {
          errors.push({ row, field: 'kickoff_time', message: 'Kickoff time must be in ISO datetime format (YYYY-MM-DDTHH:mm:ss)' })
        }

        // Validate scores if provided
        if (pick.home_score !== undefined && (pick.home_score < 0 || pick.home_score > 200)) {
          errors.push({ row, field: 'home_score', message: 'Home score must be between 0 and 200' })
        }
        if (pick.away_score !== undefined && (pick.away_score < 0 || pick.away_score > 200)) {
          errors.push({ row, field: 'away_score', message: 'Away score must be between 0 and 200' })
        }

        // Validate spread if provided
        if (pick.spread !== undefined && (pick.spread < -50 || pick.spread > 50)) {
          errors.push({ row, field: 'spread', message: 'Spread must be between -50 and 50' })
        }
      })

      setValidationErrors(errors)
      console.log(`✅ Validation complete: ${errors.length} errors found`)

    } catch (error: any) {
      console.error('Error during validation:', error)
      setValidationErrors([{
        row: 0,
        field: 'validation',
        message: `Validation error: ${error.message}`
      }])
    } finally {
      setValidating(false)
    }
  }

  const importValidData = async () => {
    if (validationErrors.length > 0) {
      alert('Please fix validation errors before importing')
      return
    }

    setUploading(true)
    const results = { success: 0, errors: 0, details: [] as string[] }

    try {
      // Get users and games data
      const { data: users } = await supabase.from('users').select('id, email')
      const { data: games } = await supabase.from('games').select('id, home_team, away_team, week, season')

      for (const pick of importData) {
        try {
          let user = users?.find(u => u.email.toLowerCase() === pick.user_email.toLowerCase())
          let game = games?.find(g => 
            g.week === pick.week && 
            g.season === pick.season &&
            g.home_team === pick.home_team &&
            g.away_team === pick.away_team
          )

          // Create user if they don't exist
          if (!user) {
            const userData = {
              email: pick.user_email.toLowerCase(),
              display_name: pick.display_name || pick.user_email.split('@')[0], // Use display_name or fallback to email prefix
              is_admin: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }

            const { data: newUser, error: userError } = await supabase
              .from('users')
              .insert(userData)
              .select()
              .single()

            if (userError) throw userError
            user = newUser
            results.details.push(`Created user: ${pick.user_email} (${pick.display_name || 'auto-generated name'})`)
          }

          // Create or update game if needed
          if (!game) {
            const gameData = {
              week: pick.week,
              season: pick.season,
              home_team: pick.home_team,
              away_team: pick.away_team,
              spread: pick.spread || 0,
              kickoff_time: pick.kickoff_time || new Date().toISOString(),
              status: (pick.home_score !== undefined && pick.away_score !== undefined) ? 'completed' : 'scheduled',
              home_score: pick.home_score || null,
              away_score: pick.away_score || null
            }

            const { data: newGame, error: gameError } = await supabase
              .from('games')
              .insert(gameData)
              .select()
              .single()

            if (gameError) throw gameError
            game = newGame
            results.details.push(`Created game: ${pick.home_team} vs ${pick.away_team} (Week ${pick.week})`)
          } else {
            // Update game with any new data provided
            const gameUpdates: any = {}
            let hasUpdates = false

            if (pick.spread !== undefined && game.spread !== pick.spread) {
              gameUpdates.spread = pick.spread
              hasUpdates = true
            }
            if (pick.home_score !== undefined && game.home_score !== pick.home_score) {
              gameUpdates.home_score = pick.home_score
              hasUpdates = true
            }
            if (pick.away_score !== undefined && game.away_score !== pick.away_score) {
              gameUpdates.away_score = pick.away_score
              hasUpdates = true
            }
            if (pick.kickoff_time && game.kickoff_time !== pick.kickoff_time) {
              gameUpdates.kickoff_time = pick.kickoff_time
              hasUpdates = true
            }
            if ((pick.home_score !== undefined && pick.away_score !== undefined) && game.status !== 'completed') {
              gameUpdates.status = 'completed'
              hasUpdates = true
            }

            if (hasUpdates) {
              const { error: updateError } = await supabase
                .from('games')
                .update(gameUpdates)
                .eq('id', game.id)

              if (updateError) throw updateError
              results.details.push(`Updated game: ${pick.home_team} vs ${pick.away_team} (Week ${pick.week})`)
            }
          }

          // Check if pick already exists
          const { data: existingPick } = await supabase
            .from('picks')
            .select('id')
            .eq('user_id', user.id)
            .eq('game_id', game.id)
            .single()

          // Prepare timestamp data
          let createdAt = new Date().toISOString()
          let submittedAt = null

          if (pick.pick_datetime) {
            // Normalize datetime format if needed
            if (pick.pick_datetime.includes(' ') && !pick.pick_datetime.includes('T')) {
              submittedAt = pick.pick_datetime.replace(' ', 'T')
            } else {
              submittedAt = pick.pick_datetime
            }
          } else {
            // Default to created time if no pick datetime provided
            submittedAt = createdAt
          }

          const pickData = {
            user_id: user.id,
            game_id: game.id,
            week: pick.week,
            season: pick.season,
            selected_team: pick.selected_team,
            is_lock: pick.is_lock,
            result: pick.result || null,
            points_earned: pick.points_earned || null,
            submitted: true, // Always mark historical picks as submitted
            submitted_at: submittedAt,
            created_at: createdAt,
            updated_at: createdAt
          }

          if (existingPick) {
            // Update existing pick
            const { error } = await supabase
              .from('picks')
              .update(pickData)
              .eq('id', existingPick.id)

            if (error) throw error
            results.details.push(`Updated: ${pick.user_email} - ${pick.selected_team}`)
          } else {
            // Insert new pick
            const { error } = await supabase
              .from('picks')
              .insert(pickData)

            if (error) throw error
            results.details.push(`Inserted: ${pick.user_email} - ${pick.selected_team}`)
          }

          results.success++

        } catch (error: any) {
          results.errors++
          results.details.push(`Error: ${pick.user_email} - ${pick.selected_team}: ${error.message}`)
        }
      }

      setImportResults(results)
      console.log(`📈 Import complete: ${results.success} success, ${results.errors} errors`)

    } catch (error: any) {
      console.error('Import error:', error)
      setImportResults({
        success: 0,
        errors: importData.length,
        details: [`Fatal error: ${error.message}`]
      })
    } finally {
      setUploading(false)
    }
  }

  const resetImport = () => {
    setImportData([])
    setValidationErrors([])
    setImportResults(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Import Historical Picks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-charcoal-600">
            Upload a CSV file containing historical pick data. The system will validate and import the picks into the database.
          </p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">Required CSV Format:</h4>
            <div className="text-sm text-blue-800 space-y-1 grid md:grid-cols-2 gap-x-4">
              <div><strong>user_email</strong> - Email address of the user</div>
              <div><strong>display_name</strong> - Display name (used for new user creation)</div>
              <div><strong>week</strong> - Week number (1-18)</div>
              <div><strong>season</strong> - Season year (e.g., 2024)</div>
              <div><strong>game_matchup</strong> - Game description (for reference)</div>
              <div><strong>home_team</strong> - Home team name</div>
              <div><strong>away_team</strong> - Away team name</div>
              <div><strong>selected_team</strong> - Team picked (must match home or away)</div>
              <div><strong>is_lock</strong> - true/false</div>
              <div><strong>result</strong> - win/loss/push (optional)</div>
              <div><strong>points_earned</strong> - Points earned (optional)</div>
              <div><strong>pick_datetime</strong> - When pick was made (YYYY-MM-DD HH:mm:ss or ISO format, optional)</div>
              <div><strong>home_score</strong> - Final home team score (optional)</div>
              <div><strong>away_score</strong> - Final away team score (optional)</div>
              <div><strong>spread</strong> - Point spread (optional)</div>
              <div><strong>kickoff_time</strong> - Game start time (ISO format, optional)</div>
            </div>
          </div>
          
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h4 className="font-semibold text-amber-900 mb-2">Import Behavior:</h4>
            <div className="text-sm text-amber-800 space-y-2">
              <p><strong>User Creation:</strong> Users will be automatically created if they don't exist in the system using the provided email and display_name.</p>
              <p><strong>Game Data:</strong> The system will automatically create games if they don't exist using the provided home_team, away_team, 
              and other game data. If games already exist, it will update them with any new score, spread, or time data provided.</p>
              <p><strong>Pick Status:</strong> All imported picks are automatically marked as submitted since they represent historical data.</p>
              <p><strong>Timestamps:</strong> If no pick_datetime is provided, the current import time will be used.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle>Upload CSV File</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            disabled={uploading}
          />
          
          <div className="flex space-x-2">
            <Button
              onClick={validateData}
              disabled={importData.length === 0 || validating}
              variant="outline"
            >
              {validating ? 'Validating...' : 'Validate Data'}
            </Button>
            
            <Button
              onClick={importValidData}
              disabled={importData.length === 0 || validationErrors.length > 0 || uploading}
            >
              {uploading ? 'Importing...' : 'Import Data'}
            </Button>
            
            <Button
              onClick={resetImport}
              variant="outline"
              disabled={uploading || validating}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Preview */}
      {importData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Data Preview ({importData.length} picks)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">User</th>
                    <th className="text-left p-2">Week</th>
                    <th className="text-left p-2">Game</th>
                    <th className="text-left p-2">Pick</th>
                    <th className="text-left p-2">Lock</th>
                    <th className="text-left p-2">Score</th>
                    <th className="text-left p-2">Spread</th>
                    <th className="text-left p-2">Result</th>
                    <th className="text-left p-2">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {importData.slice(0, 10).map((pick, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-2 text-xs">{pick.user_email}</td>
                      <td className="p-2">{pick.week}</td>
                      <td className="p-2 text-xs">{pick.away_team} @ {pick.home_team}</td>
                      <td className="p-2 text-xs">{pick.selected_team}</td>
                      <td className="p-2">{pick.is_lock ? '🔒' : ''}</td>
                      <td className="p-2 text-xs">
                        {pick.away_score !== undefined && pick.home_score !== undefined 
                          ? `${pick.away_score}-${pick.home_score}` 
                          : '-'}
                      </td>
                      <td className="p-2">{pick.spread || '-'}</td>
                      <td className="p-2">{pick.result || '-'}</td>
                      <td className="p-2">{pick.points_earned || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importData.length > 10 && (
                <p className="text-center text-charcoal-500 py-2">
                  ... and {importData.length - 10} more picks
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-700">Validation Errors ({validationErrors.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {validationErrors.map((error, index) => (
                <div key={index} className="text-sm bg-red-50 border border-red-200 rounded p-2">
                  <strong>Row {error.row}:</strong> {error.field} - {error.message}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Results */}
      {importResults && (
        <Card className="border-green-200">
          <CardHeader>
            <CardTitle className="text-green-700">Import Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{importResults.success}</div>
                <div className="text-sm text-green-700">Successful</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{importResults.errors}</div>
                <div className="text-sm text-red-700">Errors</div>
              </div>
            </div>
            
            <details className="text-sm">
              <summary className="cursor-pointer font-medium mb-2">View Details</summary>
              <div className="space-y-1 max-h-64 overflow-y-auto bg-stone-50 p-3 rounded">
                {importResults.details.map((detail, index) => (
                  <div key={index} className={
                    detail.startsWith('Error:') ? 'text-red-600' : 
                    detail.startsWith('Updated:') ? 'text-blue-600' : 'text-green-600'
                  }>
                    {detail}
                  </div>
                ))}
              </div>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  )
}