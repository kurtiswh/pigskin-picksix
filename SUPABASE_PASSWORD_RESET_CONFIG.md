# Supabase Password Reset Configuration Guide

## ⚠️ CRITICAL: This configuration must be completed in Supabase Dashboard

The password reset functionality has been updated in the code, but requires matching configuration in your Supabase Dashboard.

## Required Configuration Steps

### 1. Update Redirect URLs
**Location:** Supabase Dashboard > Settings > Authentication > URL Configuration

Add these URLs to **Redirect URLs**:
```
https://pigskinpicksix.com/reset-password
http://localhost:5173/reset-password
http://localhost:5174/reset-password
http://127.0.0.1:3000/reset-password
```

**Note:** The local port may vary (5173 or 5174) depending on which ports are available when you start the dev server.

### 2. Verify Email Template Configuration  
**Location:** Supabase Dashboard > Authentication > Email Templates

**Check "Reset Password" template:**
- ✅ Template should be **ENABLED**
- ✅ Should use **Recovery** flow (generates `#access_token=` URLs)
- ❌ Should **NOT** use Confirmation flow (generates `?code=` URLs)

**Template should contain:**
```html
{{ .ConfirmationURL }}
```
**NOT:**
```html
{{ .SiteURL }}/reset-password?code={{ .Token }}
```

### 3. Current Issue
Based on the URL you showed: `pigskinpicksix.com/?code=d726875c-545a-42d2-847e-e692d239be0f`

The issue is that Supabase is generating **confirmation codes** (`?code=`) instead of **recovery tokens** (`#access_token=` with `type=recovery`).

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