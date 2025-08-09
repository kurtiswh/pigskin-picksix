import { createClient } from '@supabase/supabase-js'

// Supabase configuration
const supabaseUrl = 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8'

const supabase = createClient(supabaseUrl, supabaseKey)

// Sample college football games for Week 1, 2024
const sampleGames = [
  {
    week: 1,
    season: 2024,
    home_team: 'Georgia',
    away_team: 'Clemson',
    spread: -13.5,
    kickoff_time: '2024-08-31T20:30:00Z',
    status: 'completed',
    home_score: 34,
    away_score: 3
  },
  {
    week: 1,
    season: 2024,
    home_team: 'Texas',
    away_team: 'Colorado State',
    spread: -21.0,
    kickoff_time: '2024-08-31T19:00:00Z',
    status: 'completed',
    home_score: 52,
    away_score: 0
  },
  {
    week: 1,
    season: 2024,
    home_team: 'Notre Dame',
    away_team: 'Texas A&M',
    spread: -3.5,
    kickoff_time: '2024-08-31T19:30:00Z',
    status: 'completed',
    home_score: 23,
    away_score: 13
  },
  {
    week: 1,
    season: 2024,
    home_team: 'Alabama',
    away_team: 'Western Kentucky',
    spread: -28.0,
    kickoff_time: '2024-08-31T19:00:00Z',
    status: 'completed',
    home_score: 63,
    away_score: 0
  },
  {
    week: 1,
    season: 2024,
    home_team: 'Michigan',
    away_team: 'Fresno State',
    spread: -17.5,
    kickoff_time: '2024-08-31T19:30:00Z',
    status: 'completed',
    home_score: 30,
    away_score: 10
  },
  {
    week: 1,
    season: 2024,
    home_team: 'Ohio State',
    away_team: 'Akron',
    spread: -49.5,
    kickoff_time: '2024-08-31T19:30:00Z',
    status: 'completed',
    home_score: 52,
    away_score: 6
  },
  {
    week: 1,
    season: 2024,
    home_team: 'USC',
    away_team: 'LSU',
    spread: -4.5,
    kickoff_time: '2024-09-01T19:30:00Z',
    status: 'in_progress',
    home_score: 14,
    away_score: 10
  },
  {
    week: 1,
    season: 2024,
    home_team: 'Oregon',
    away_team: 'Idaho',
    spread: -42.0,
    kickoff_time: '2024-09-01T22:00:00Z',
    status: 'scheduled'
  },
  {
    week: 1,
    season: 2024,
    home_team: 'Florida State',
    away_team: 'Georgia Tech',
    spread: -10.5,
    kickoff_time: '2024-08-31T20:00:00Z',
    status: 'completed',
    home_score: 24,
    away_score: 21
  },
  {
    week: 1,
    season: 2024,
    home_team: 'Penn State',
    away_team: 'West Virginia',
    spread: -8.5,
    kickoff_time: '2024-08-31T20:00:00Z',
    status: 'completed',
    home_score: 34,
    away_score: 12
  }
]

// Sample Week 2 games
const week2Games = [
  {
    week: 2,
    season: 2024,
    home_team: 'Texas',
    away_team: 'Michigan',
    spread: -6.5,
    kickoff_time: '2024-09-07T19:00:00Z',
    status: 'scheduled'
  },
  {
    week: 2,
    season: 2024,
    home_team: 'Georgia',
    away_team: 'Tennessee Tech',
    spread: -45.0,
    kickoff_time: '2024-09-07T19:30:00Z',
    status: 'scheduled'
  },
  {
    week: 2,
    season: 2024,
    home_team: 'Alabama',
    away_team: 'South Florida',
    spread: -24.5,
    kickoff_time: '2024-09-07T19:00:00Z',
    status: 'scheduled'
  },
  {
    week: 2,
    season: 2024,
    home_team: 'Ohio State',
    away_team: 'Oregon',
    spread: -3.0,
    kickoff_time: '2024-09-07T19:30:00Z',
    status: 'scheduled'
  },
  {
    week: 2,
    season: 2024,
    home_team: 'Notre Dame',
    away_team: 'Northern Illinois',
    spread: -28.0,
    kickoff_time: '2024-09-07T15:30:00Z',
    status: 'scheduled'
  }
]

async function addSampleData() {
  try {
    console.log('Adding sample games...')
    
    // Insert Week 1 games
    const { data: week1Data, error: week1Error } = await supabase
      .from('games')
      .insert(sampleGames)
      .select()
    
    if (week1Error) {
      console.error('Error inserting Week 1 games:', week1Error)
      return
    }
    
    console.log(`Added ${week1Data.length} Week 1 games`)
    
    // Insert Week 2 games
    const { data: week2Data, error: week2Error } = await supabase
      .from('games')
      .insert(week2Games)
      .select()
    
    if (week2Error) {
      console.error('Error inserting Week 2 games:', week2Error)
      return
    }
    
    console.log(`Added ${week2Data.length} Week 2 games`)
    
    // Get all games to create sample picks
    const allGames = [...week1Data, ...week2Data]
    
    // Get existing users to create picks for
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, display_name')
    
    if (usersError) {
      console.error('Error fetching users:', usersError)
      return
    }
    
    if (users.length === 0) {
      console.log('No users found. Skipping picks creation.')
      console.log('Sample games have been added successfully!')
      return
    }
    
    console.log(`Found ${users.length} users, creating sample picks...`)
    
    // Create sample picks for completed games
    const samplePicks = []
    const completedGames = allGames.filter(game => game.status === 'completed')
    
    users.forEach(user => {
      completedGames.forEach((game, gameIndex) => {
        // Randomly assign picks to create variety
        const teams = [game.home_team, game.away_team]
        const selectedTeam = teams[Math.floor(Math.random() * 2)]
        const isLock = gameIndex < 3 && Math.random() > 0.7 // Some lock picks
        
        // Calculate result and points based on actual game scores
        let result, pointsEarned = 0
        
        if (game.home_score !== null && game.away_score !== null) {
          const homeMargin = game.home_score - game.away_score
          const coverMargin = homeMargin + game.spread
          
          let didCover = false
          if (selectedTeam === game.home_team) {
            didCover = coverMargin > 0
          } else {
            didCover = coverMargin < 0
          }
          
          if (Math.abs(coverMargin) < 0.5) {
            result = 'push'
            pointsEarned = 10
          } else if (didCover) {
            result = 'win'
            pointsEarned = 20
            
            // Add bonus points based on margin
            const winMargin = Math.abs(homeMargin)
            if (winMargin >= 11 && winMargin < 20) {
              pointsEarned += 1
            } else if (winMargin >= 20 && winMargin < 29) {
              pointsEarned += 3
            } else if (winMargin >= 29) {
              pointsEarned += 5
            }
            
            // Double bonus for lock picks
            if (isLock) {
              pointsEarned += (pointsEarned - 20)
            }
          } else {
            result = 'loss'
            pointsEarned = 0
          }
        }
        
        samplePicks.push({
          user_id: user.id,
          game_id: game.id,
          week: game.week,
          season: game.season,
          selected_team: selectedTeam,
          is_lock: isLock,
          submitted: true,
          submitted_at: new Date(Date.now() - Math.random() * 86400000).toISOString(),
          result: result,
          points_earned: pointsEarned
        })
      })
    })
    
    // Insert sample picks
    if (samplePicks.length > 0) {
      const { data: picksData, error: picksError } = await supabase
        .from('picks')
        .insert(samplePicks)
        .select()
      
      if (picksError) {
        console.error('Error inserting picks:', picksError)
        return
      }
      
      console.log(`Added ${picksData.length} sample picks`)
    }
    
    console.log('✅ Sample data added successfully!')
    console.log('You can now test the Games & Scoring tab with realistic data.')
    
  } catch (error) {
    console.error('Error adding sample data:', error)
  }
}

addSampleData()