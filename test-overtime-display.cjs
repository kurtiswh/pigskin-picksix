// Test overtime display logic
function testOvertimeDisplay() {
  console.log('🏈 Testing Overtime Display Logic\n');
  
  // Simulate the logic from GameResultCard.tsx
  function getGameTimeDisplay(quarter, clock) {
    // Special case: Q2 with 0:00 or 00:00 should show "Halftime"
    if (quarter === 2 && (clock === '0:00' || clock === '00:00')) {
      return 'Halftime'
    }
    
    // Handle overtime periods (period > 4)
    if (quarter > 4) {
      const overtimeNumber = quarter - 4
      return overtimeNumber === 1 ? `OT ${clock}` : `${overtimeNumber}OT ${clock}`
    }
    
    return `${quarter}Q ${clock}`
  }
  
  const testCases = [
    { quarter: 1, clock: '15:00', expected: '1Q 15:00' },
    { quarter: 2, clock: '7:30', expected: '2Q 7:30' },
    { quarter: 2, clock: '0:00', expected: 'Halftime' },
    { quarter: 2, clock: '00:00', expected: 'Halftime' },
    { quarter: 3, clock: '10:00', expected: '3Q 10:00' },
    { quarter: 4, clock: '2:15', expected: '4Q 2:15' },
    { quarter: 4, clock: '0:00', expected: '4Q 0:00' }, // End of regulation, not halftime
    { quarter: 5, clock: '15:00', expected: 'OT 15:00' }, // First OT
    { quarter: 5, clock: '5:30', expected: 'OT 5:30' },
    { quarter: 6, clock: '10:00', expected: '2OT 10:00' }, // Second OT
    { quarter: 7, clock: '3:45', expected: '3OT 3:45' }, // Third OT
    { quarter: 8, clock: '12:00', expected: '4OT 12:00' }, // Fourth OT (rare but possible)
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(({ quarter, clock, expected }) => {
    const result = getGameTimeDisplay(quarter, clock);
    const success = result === expected;
    
    console.log(`Quarter ${quarter}, Clock ${clock}: ${result} ${success ? '✅' : '❌'}`);
    if (!success) {
      console.log(`  Expected: ${expected}, Got: ${result}`);
      failed++;
    } else {
      passed++;
    }
  });
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All overtime display tests passed!');
  } else {
    console.log('⚠️  Some tests failed - check logic');
  }
}

testOvertimeDisplay();