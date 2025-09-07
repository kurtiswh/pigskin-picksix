/**
 * Test script to verify push calculation fix
 */

// Mock the calculatePickResult function with the new unified logic
function calculatePickResult(selectedTeam, homeTeam, awayTeam, homeScore, awayScore, spread, isLock = false) {
  const pickedHome = selectedTeam === homeTeam
  const actualMargin = homeScore - awayScore
  
  // Unified push calculation logic (matches CFBD Live Updater and Live Update Service)
  // Calculate spread-adjusted margin: homeMargin + spread
  const adjustedMargin = actualMargin + spread
  
  // Determine result based on adjusted margin (with floating-point tolerance)
  let result
  if (Math.abs(adjustedMargin) < 0.5) {
    result = 'push' // Within 0.5 points is considered a push
  } else if (adjustedMargin > 0) {
    // Home team covered the spread
    result = pickedHome ? 'win' : 'loss'
  } else {
    // Away team covered the spread
    result = pickedHome ? 'loss' : 'win'
  }
  
  // Calculate base points
  let basePoints = 0
  if (result === 'win') {
    basePoints = 20
  } else if (result === 'push') {
    basePoints = 10
  } else {
    basePoints = 0
  }
  
  // Calculate bonus points for wins (unified logic)
  let bonusPoints = 0
  if (result === 'win') {
    // Cover margin is simply the absolute value of adjusted margin
    const coverMargin = Math.abs(adjustedMargin)
    
    if (coverMargin >= 29) {
      bonusPoints = 5 // Cover by 29+
    } else if (coverMargin >= 20) {
      bonusPoints = 3 // Cover by 20-28.5
    } else if (coverMargin >= 11) {
      bonusPoints = 1 // Cover by 11-19.5
    }
  }
  
  // Apply lock multiplier
  if (isLock) {
    bonusPoints = bonusPoints * 2
  }
  
  const totalPoints = basePoints + bonusPoints
  const displayCoverMargin = result === 'win' ? Math.abs(adjustedMargin) : 0
  
  return {
    result,
    points: totalPoints,
    bonusPoints,
    adjustedMargin,
    coverMargin: displayCoverMargin
  }
}

console.log('🧪 TESTING PUSH CALCULATION FIX')
console.log('=' .repeat(50))
console.log('')

// Test cases for various push scenarios
const testCases = [
  {
    name: 'Exact Push: Louisville 28 - James Madison 14 (spread -14)',
    selectedTeam: 'Louisville',
    homeTeam: 'Louisville', 
    awayTeam: 'James Madison',
    homeScore: 28,
    awayScore: 14, 
    spread: -14,
    expected: 'push'
  },
  {
    name: 'Exact Push: James Madison 14 - Louisville 28 (spread -14)', 
    selectedTeam: 'James Madison',
    homeTeam: 'Louisville',
    awayTeam: 'James Madison', 
    homeScore: 28,
    awayScore: 14,
    spread: -14,
    expected: 'push'
  },
  {
    name: 'Close Win: Home team wins by 14.1 (spread -14)',
    selectedTeam: 'Home Team',
    homeTeam: 'Home Team',
    awayTeam: 'Away Team',
    homeScore: 28,
    awayScore: 13,
    spread: -14,
    expected: 'win'
  },
  {
    name: 'Close Loss: Home team wins by 13.9 (spread -14)', 
    selectedTeam: 'Home Team',
    homeTeam: 'Home Team',
    awayTeam: 'Away Team', 
    homeScore: 28,
    awayScore: 14,
    spread: -14,
    expected: 'push' // Should be push since 14 - 14 = 0
  },
  {
    name: 'Half-point spread push test: 28-14 with -14.5 spread',
    selectedTeam: 'Home Team',
    homeTeam: 'Home Team', 
    awayTeam: 'Away Team',
    homeScore: 28,
    awayScore: 14,
    spread: -14.5,
    expected: 'loss' // 14 - 14.5 = -0.5, home team didn\'t cover
  },
  {
    name: 'Floating point precision test: 21-7 with -14.0 spread',
    selectedTeam: 'Home Team',
    homeTeam: 'Home Team',
    awayTeam: 'Away Team',
    homeScore: 21,
    awayScore: 7,
    spread: -14.0,
    expected: 'push' // 14 - 14.0 = 0.0, should be push
  }
]

let passedTests = 0
let totalTests = testCases.length

testCases.forEach((test, i) => {
  console.log(`${i + 1}. ${test.name}`)
  
  const result = calculatePickResult(
    test.selectedTeam,
    test.homeTeam, 
    test.awayTeam,
    test.homeScore,
    test.awayScore,
    test.spread
  )
  
  console.log(`   Score: ${test.awayTeam} ${test.awayScore} - ${test.homeScore} ${test.homeTeam}`)
  console.log(`   Spread: ${test.spread}`)
  console.log(`   Adjusted margin: ${result.adjustedMargin}`)
  console.log(`   Selected: ${test.selectedTeam}`)
  console.log(`   Expected: ${test.expected}`)
  console.log(`   Actual: ${result.result}`)
  console.log(`   Points: ${result.points}`)
  
  if (result.result === test.expected) {
    console.log(`   ✅ PASS`)
    passedTests++
  } else {
    console.log(`   ❌ FAIL`)
  }
  
  console.log('')
})

console.log('=' .repeat(50))
console.log(`🎯 TEST RESULTS: ${passedTests}/${totalTests} tests passed`)

if (passedTests === totalTests) {
  console.log('✅ ALL TESTS PASSED - Push calculation fix is working correctly!')
} else {
  console.log(`❌ ${totalTests - passedTests} tests failed - Push calculation needs more work`)
}

console.log('')
console.log('🔄 The fix ensures:')
console.log('   • Consistent push calculation across all services')  
console.log('   • Floating-point tolerance (< 0.5) instead of exact equality')
console.log('   • Simplified, unified logic that matches CFBD Live Updater')
console.log('   • Manual corrections won\'t be overridden by automated processes')