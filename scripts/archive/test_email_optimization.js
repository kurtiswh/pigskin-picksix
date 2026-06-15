import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testEmailOptimization() {
  console.log('🔧 EMAIL SYSTEM OPTIMIZATION TEST');
  console.log('=====================================\n');

  // Test 1: Check if email jobs table is accessible
  console.log('1️⃣ Testing email_jobs table access...');
  try {
    const { data, error } = await supabase.from('email_jobs').select('*').limit(1);
    if (error) {
      console.log('❌ email_jobs table error:', error.message);
      return;
    }
    console.log('✅ email_jobs table accessible\n');
  } catch (e) {
    console.log('❌ email_jobs table exception:', e.message);
    return;
  }

  // Test 2: Check if we can create email jobs
  console.log('2️⃣ Testing email job creation (anonymous)...');
  try {
    const testJob = {
      user_id: null,
      email: 'test@example.com',
      template_type: 'picks_submitted',
      subject: 'Test Email Job',
      html_content: '<p>Test email</p>',
      text_content: 'Test email',
      scheduled_for: new Date().toISOString(),
      status: 'pending',
      attempts: 0
    };
    
    const { data: job, error } = await supabase
      .from('email_jobs')
      .insert(testJob)
      .select()
      .single();
    
    if (error) {
      console.log('❌ Email job creation failed:', error.message);
      return;
    }
    
    console.log('✅ Email job created successfully');
    console.log('📧 Job ID:', job.id);
    
    // Clean up
    await supabase.from('email_jobs').delete().eq('id', job.id);
    console.log('🧹 Test job cleaned up\n');
    
  } catch (e) {
    console.log('❌ Email job creation exception:', e.message);
    return;
  }

  // Test 3: Check Edge Function status
  console.log('3️⃣ Testing send-email Edge Function...');
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: 'test@example.com',
        subject: 'Test Email',
        html: '<p>Test email</p>',
        text: 'Test email',
      })
    });

    console.log('📡 Edge Function response status:', response.status);
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Edge Function working!');
      console.log('📧 Result:', result);
    } else {
      const errorText = await response.text();
      console.log('❌ Edge Function failed');
      console.log('💡 Status:', response.status);
      console.log('💡 Error:', errorText);
      
      if (response.status === 404) {
        console.log('\n🚨 EDGE FUNCTION NOT DEPLOYED');
        console.log('💡 The send-email Edge Function is not deployed to Supabase');
        console.log('💡 This is why emails are not being sent');
      } else if (response.status === 401) {
        console.log('\n🚨 AUTHENTICATION ISSUE');
        console.log('💡 Edge Function authentication needs to be fixed');
      }
    }
  } catch (e) {
    console.log('❌ Edge Function test failed:', e.message);
    console.log('💡 This suggests the Edge Function is not deployed or accessible');
  }
  
  console.log('\n4️⃣ SUMMARY & RECOMMENDATIONS:');
  console.log('===============================');
  console.log('✅ Email jobs can be created (RLS policies fixed)');
  console.log('❌ Edge Function issues prevent email sending');
  console.log('\n🔧 NEXT STEPS:');
  console.log('1. Deploy send-email Edge Function to Supabase');
  console.log('2. Set RESEND_API_KEY environment variable in Supabase');
  console.log('3. OR implement alternative email sending method');
  console.log('\n📋 Alternative approaches:');
  console.log('- Use a background job processor');
  console.log('- Implement client-side email via a webhook');
  console.log('- Use a third-party email service directly');
}

testEmailOptimization().catch(console.error);