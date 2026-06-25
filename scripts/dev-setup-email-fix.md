# Email Verification Development Setup

## Current Issue
Resend free tier only allows sending emails to your verified address (stacionari@gmail.com).
New user sign-ups with different emails will fail.

## Solution Options

### Option 1: Disable Email Verification (Development Only)
Add this to your `.env` file:
```bash
BETTER_AUTH_SKIP_EMAIL_VERIFICATION=true
```

**Pros:**
- Quick fix for development
- Allows testing with any email address
- No changes to code needed

**Cons:**
- Not suitable for production
- Security risk for production deployment
- Users won't receive verification emails

### Option 2: Verify Custom Domain in Resend (Production Ready)
1. Go to https://resend.com/domains
2. Add your domain (e.g., vectormatch.com or your domain)
3. Configure DNS records as instructed by Resend
4. Update the sender address in `src/lib/email.ts`:
   ```typescript
   from: "VectorMatch <noreply@yourdomain.com>",
   ```

**Pros:**
- Production-ready solution
- Can send to any email address
- Better deliverability
- Professional branding

**Cons:**
- Requires domain ownership
- DNS configuration needed
- Takes time to propagate

### Option 3: Use Only Your Email for Testing
For development, only sign up with stacionari@gmail.com to test the email flow.

**Pros:**
- No configuration changes
- Email verification works correctly
- Tests the full email flow

**Cons:**
- Limited to one email address
- Not practical for multi-user testing

## Recommended Approach
1. **Development**: Use Option 1 (disable verification) or Option 3 (use your email only)
2. **Production**: Use Option 2 (verify custom domain)

## Testing After Fix
After applying any fix, test the sign-up flow:
1. Try to create a new account
2. Check if verification email is sent (or if account is created without verification)
3. Verify the authentication flow works end-to-end
