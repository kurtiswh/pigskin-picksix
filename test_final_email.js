import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testFinalEmail() {
  console.log('🎯 FINAL EMAIL TEST - After adding RESEND_API_KEY');
  console.log('================================================');
  
  try {
    // Test with a real email (replace with your email)
    const testEmail = 'your-email@domain.com'; // 👈 CHANGE THIS
    
    const response = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: testEmail,
        subject: '🎉 EMAIL SYSTEM WORKING - Pick Confirmation Test',
        html: `
          <h2>🏈 Pick Six Confirmation</h2>
          <p>Congratulations! Your email system is now working.</p>
          <p>This email was sent at: <strong>${new Date().toLocaleString()}</strong></p>
          <p>All pick confirmations will now be delivered automatically!</p>
        `,
        text: `Pick Six Confirmation - Email system is working! Sent at: ${new Date().toLocaleString()}`,
        from: 'Pigskin Pick Six <admin@pigskinpicksix.com>'
      })
    });
    
    console.log(`📡 Response status: ${response.status}`);
    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log('✅ SUCCESS! Email sent successfully!');
      console.log('📧 Message ID:', result.messageId);
      console.log(`📬 Check your inbox: ${testEmail}`);
      console.log('📊 Check Resend dashboard for delivery logs');
      console.log('');
      console.log('🎉 EMAIL SYSTEM IS NOW FULLY OPERATIONAL!');
      console.log('📧 Pick confirmations will now be sent automatically');
    } else {
      console.log('❌ Still failing:');
      console.log('Response:', result);
      
      if (JSON.stringify(result).includes('RESEND_API_KEY')) {
        console.log('💡 RESEND_API_KEY still not set correctly');
        console.log('💡 Double-check the environment variable in Supabase Dashboard');
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

console.log('📋 INSTRUCTIONS:');
console.log('1. Add RESEND_API_KEY to Supabase Dashboard Edge Functions');
console.log('2. Change testEmail variable in this script to your real email');
console.log('3. Run this script to test');
console.log('');

testFinalEmail().catch(console.error);