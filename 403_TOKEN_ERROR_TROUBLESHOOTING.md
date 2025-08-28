# 403 "One-time token not found" Error - Troubleshooting Guide

## Quick Diagnosis

Run this in the browser console when user reports 403 error:
```javascript
// Full diagnosis
await diagnose403Error('user@email.com')

// Check what a valid link should look like
simulatePasswordResetLink('user@email.com')
```

## Error Pattern from Logs

```
User: mwang3@uco.edu
Time: 2025-01-27T21:52:16.518Z - Password reset requested
Time: 2025-01-27T21:53:18.259Z - 403 error "One-time token not found"
Gap: ~1 minute (should be valid for 1 hour)
```

## Common Causes & Solutions

### 1. **No Tokens in URL** (Most Common)
**Symptom**: `testTokenValidationScenarios()` shows `hasValidTokens: false`

**Causes**:
- User navigated directly to `/reset-password` instead of clicking email link
- Tokens already consumed (page refreshed after initial load)
- Email client stripped the hash fragment

**Solution**:
- User must click the link directly from email
- Request new password reset if tokens were consumed

### 2. **Token Already Used**
**Symptom**: 403 error immediately when clicking link

**Causes**:
- User clicked link multiple times
- Multiple browser tabs open with same link
- Browser cached/auto-refreshed the page

**Solution**:
- Request new password reset
- Use link immediately in single tab
- Clear browser cache before clicking

### 3. **Token Expired**
**Symptom**: Link worked initially, fails later

**Causes**:
- More than 1 hour passed since email sent
- User saved email for later
- Email delivery was delayed

**Solution**:
- Request fresh password reset
- Click link within 1 hour of receiving

### 4. **Domain Mismatch**
**Symptom**: Immediate 403 on valid-looking link

**Causes**:
- Email uses `www.pigskinpicksix.com`
- Site uses `pigskinpicksix.com` (or vice versa)
- Redirect URLs not configured in Supabase

**Solution**:
- Add both www and non-www URLs to Supabase redirect list
- Ensure Site URL matches primary domain

### 5. **Email Client Issues**
**Symptom**: Link looks malformed or incomplete

**Causes**:
- Email client preview modified link
- Security software scanned/clicked link
- Link was forwarded/copied incorrectly

**Solution**:
- Copy link and paste in browser manually
- Use webmail instead of desktop client
- Disable email security scanning temporarily

## Debugging Steps for Support

### Step 1: Immediate Checks
```javascript
// On reset password page, run:
testTokenValidationScenarios()
```

Check for:
- `hasValidTokens: false` → No tokens present
- `errorFound: "access_denied"` → Token validation failed

### Step 2: Full Diagnosis
```javascript
// Run comprehensive check:
await diagnose403Error('user@email.com')
```

Review all test results, especially:
- Current Page Analysis
- Supabase Session Check
- 403 Error Pattern Analysis

### Step 3: Compare Valid Link Format
```javascript
// Show what link should look like:
simulatePasswordResetLink('user@email.com')
```

Compare with actual link user received

### Step 4: Test New Reset
1. Have user request new password reset
2. Monitor console while they click link
3. Check enhanced debugging output in console

## Enhanced Logging Output

When user clicks reset link, console will show:

```
🔍 ENHANCED TOKEN DEBUG (for 403 error diagnosis): {
  timestamp: "2025-01-27T21:53:18.259Z",
  referrer: "email-client-domain",
  sameDomain: false,
  // ... more context
}

❌ 403 TOKEN ERROR - This matches user mwang3@uco.edu issue!
❌ Token validation context: {
  possibleCauses: [
    "1. Token expired (1 hour limit)",
    "2. Token already used",
    "3. Domain mismatch",
    // ...
  ]
}
```

## Prevention Measures

### For Administrators:
1. **Ensure Supabase Configuration**:
   - Both www and non-www redirect URLs added
   - Email template uses `{{ .ConfirmationURL }}`
   - Site URL matches primary domain

2. **Monitor Pattern**:
   - Track 403 error frequency
   - Note time between email send and click
   - Check for domain consistency

### For Users:
1. **Best Practices**:
   - Click reset link immediately
   - Use link only once
   - Don't save for later
   - Use same browser for request and reset
   - Disable aggressive security/privacy extensions

2. **If Link Fails**:
   - Request new reset immediately
   - Clear browser cache/cookies
   - Try different browser
   - Use incognito/private mode

## Contact Support With:
- Exact error message displayed
- Time you requested reset
- Time you clicked link  
- Browser and device used
- Screenshot of error page
- Console output from `diagnose403Error()`