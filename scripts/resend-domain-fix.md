# Resend Email Domain Fix

## Current Issue
Resend's `onboarding@resend.dev` domain is restricted for testing only and can only send emails to the account owner's email address (stacionari@gmail.com).
New user sign-ups with different emails will fail with a 403 error.

## Important Context
Resend DOES have a generous free tier (3,000 emails/month, 100 emails/day) that is sufficient for app users to receive verification emails. The issue is NOT about email quotas, but about domain restrictions.

## The Real Problem
Your app is using `onboarding@resend.dev` as the sender address. This domain has a specific restriction:
> "The `resend.dev` domain is only available for testing purposes and can only send emails to the email address associated with your Resend account."

## The Solution

### Step 1: Verify Your Own Domain in Resend
1. Go to https://resend.com/domains
2. Click "Add Domain" 
3. Enter your domain (e.g., `vectormatch.com` or any domain you own)
4. Add the DNS records that Resend provides (SPF, DKIM, etc.)
5. Wait for verification (usually takes a few minutes to propagate)

### Step 2: Update Your Email Configuration
Once your domain is verified, update the sender address in `src/lib/email.ts`:
```typescript
from: "VectorMatch <noreply@yourdomain.com>", // Replace with your verified domain
```

The code has already been updated to use a placeholder domain. You just need to:
1. Replace `yourdomain.com` with your actual verified domain
2. Ensure the domain is verified in Resend dashboard

## Why This Works
- Resend's free tier allows 3,000 emails/month to any recipients
- The restriction is only on the `resend.dev` domain, not on email quotas
- Once you use your own verified domain, you can send to any email address

## Alternative (Development Only)
If you want to test without setting up a domain, you can temporarily disable email verification:
```bash
BETTER_AUTH_SKIP_EMAIL_VERIFICATION=true
```

## Testing After Fix
1. Verify your domain in Resend dashboard
2. Update the sender address in `src/lib/email.ts`
3. Test the sign-up flow with a new email address
4. Check if verification email is received
