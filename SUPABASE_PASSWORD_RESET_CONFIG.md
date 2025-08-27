# Supabase Password Reset Configuration Guide

## ⚠️ CRITICAL: This configuration must be completed in Supabase Dashboard

The password reset functionality has been updated in the code, but requires matching configuration in your Supabase Dashboard.

## 🚨 URGENT FIXES FOR CURRENT ERRORS

### Current Error 1: "403: Email link is invalid or has expired"
**Root Cause:** URL mismatch between email template and allowed redirect URLs
**Solution:** Add both www and non-www versions of your domain

### Current Error 2: "400: PKCE auth code and code verifier missing"  
**Root Cause:** Email template is using wrong flow (confirmation instead of recovery)
**Solution:** Verify email template uses recovery flow with proper tokens

## Required Configuration Steps

### 1. Update Redirect URLs (CRITICAL FIX)
**Location:** Supabase Dashboard > Settings > Authentication > URL Configuration

Add these URLs to **Redirect URLs** (include BOTH www and non-www):
```
https://www.pigskinpicksix.com/reset-password
https://pigskinpicksix.com/reset-password
http://localhost:5173/reset-password
http://localhost:5174/reset-password
http://127.0.0.1:3000/reset-password
```

**⚠️ IMPORTANT:** The 403 error occurs because emails link to `pigskinpicksix.com` but redirect URLs may only include `www.pigskinpicksix.com`

### 2. Fix Email Template Configuration (CRITICAL FIX)
**Location:** Supabase Dashboard > Authentication > Email Templates

**Current Problem:** Users getting "400 PKCE" errors because template generates wrong token type

**Check "Reset Password" template:**
- ✅ Template should be **ENABLED**
- ✅ Should use **Recovery** flow (generates `#access_token=...&type=recovery` URLs)
- ❌ Should **NOT** use Confirmation flow (generates `?code=` URLs)

**CORRECT Template should contain:**
```html
{{ .ConfirmationURL }}
```
**INCORRECT (causes PKCE errors):**
```html
{{ .SiteURL }}/reset-password?code={{ .Token }}
```

### 3. Site URL Configuration (CRITICAL FIX)
**Location:** Supabase Dashboard > Settings > Authentication > URL Configuration

**Set Site URL to match your primary domain:**
```
https://www.pigskinpicksix.com
```
OR
```
https://pigskinpicksix.com
```

**⚠️ IMPORTANT:** This must match the domain in your email template and redirect URLs

### 4. Current Issues Analysis
Based on your error logs:

**Error 1:** `403: Email link is invalid or has expired`
- **Cause:** URL mismatch between Site URL and redirect URLs
- **Fix:** Ensure both www and non-www versions are in redirect URLs list

**Error 2:** `400: PKCE auth code and code verifier missing`
- **Cause:** Email template using confirmation flow instead of recovery flow
- **Fix:** Use default Supabase recovery template (see section 2 above)

## How to Fix the Email Template

1. Go to **Supabase Dashboard > Authentication > Email Templates**
2. Select **"Reset Password"** template
3. Make sure it uses the default Supabase recovery template
4. The URL should be: `{{ .ConfirmationURL }}`
5. **Do not customize** the template to use `?code=` - this breaks the flow

## Testing the Fix

After making these changes:

1. Request a password reset
2. Check the email - the link should now contain hash parameters like:
   ```
   https://pigskinpicksix.com/reset-password#access_token=...&refresh_token=...&type=recovery
   ```
3. The link should take you directly to the reset password page
4. You should see the password reset form, not an "invalid" message

## Fallback Handling

The code has been updated to handle misrouted codes as a fallback, but the proper fix is updating the email template configuration in Supabase Dashboard.

## Verification

Once configured correctly:
- Password reset emails will contain proper recovery tokens  
- Users will go directly to `/reset-password` with valid tokens
- No more redirecting to homepage with confirmation codes