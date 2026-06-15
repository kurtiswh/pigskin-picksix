// Quick test of the scoring math
console.log('🔍 Testing scoring scenarios for 60-point issue:');
console.log('');

// Scenario 1: 5-1-0 with proper lock scoring
console.log('Expected 5-1-0 scenarios:');
console.log('4 regular wins + 1 lock win + 1 loss = 40 + 20 + 0 = 60 points ✓');
console.log('3 regular wins + 2 lock wins + 1 loss = 30 + 40 + 0 = 70 points');
console.log('5 regular wins + 0 lock wins + 1 loss = 50 + 0 + 0 = 50 points');
console.log('');

// Scenario 2: 6-0-0 misreported as 5-1-0
console.log('Possible 6-0-0 scenarios:');
console.log('6 regular wins + 0 lock wins = 60 + 0 = 60 points ✓');
console.log('5 regular wins + 1 lock win = 50 + 20 = 70 points');
console.log('');

console.log('🔍 The 60 points suggests either:');
console.log('1. Actually 6-0-0 (all wins, no losses) = 6×10 = 60');
console.log('2. Actually 4-1-0 with 1 lock win = 4×10 + 1×20 = 60');
console.log('3. Lock picks not being detected in anonymous picks');