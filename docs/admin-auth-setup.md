# Admin Google sign-in and email OTP recovery

These changes apply to `admin/` (web and its separate Android APK). The campus visitor app has no login. Existing password sign-in, user_roles checks and database RLS remain in force. No Google identity automatically gets Admin or Editor privileges.

## 1. Configure Google in Supabase

1. In the Google Cloud project, configure the OAuth consent screen and a Web application OAuth client. While the consent screen is in testing, add the permitted test accounts.
2. In Supabase Authentication > Sign In / Providers > Google, enable Google. Copy the callback URL displayed there into the Google OAuth client's Authorized redirect URIs. This is the Supabase `/auth/v1/callback` URL, not the app's callback URL.
3. Save the Google client ID and client secret in Supabase. Never put the Google client secret in Vite variables, `.env` client settings or source code.
4. In Supabase Authentication > URL Configuration, set the production Site URL. Add exact permitted redirects: `http://localhost:5173/auth/callback` (or the actual admin dev port), `https://YOUR-ADMIN-DOMAIN/auth/callback`, and `com.onelocate.admin://auth/callback`. Avoid broad production wildcards. The web host must rewrite SPA routes to index.html.
5. Keep public signup disabled if only pre-created accounts should authenticate. Google users must match an approved account and have an explicitly assigned user_roles entry. Test account linking with the same verified email; do not add role-granting triggers based on Google metadata or email domain. If a new Google account is permitted by project settings, it still receives no content access without a role.

Google authentication uses PKCE. Web callbacks exchange the one-time code; Android uses the system browser and an exact app deep link. An installed APK must include the new App and Browser plugins and intent filter. Restarting/killing the app during OAuth may require retrying sign-in if the original verifier is unavailable.

## 2. Configure recovery OTP email

In Supabase Authentication > Email Templates > Reset Password, replace the default link-only body with a code template, for example:

```html
<h2>Reset your 1Locate password</h2>
<p>Enter this code in the 1Locate Admin password reset screen:</p>
<p><strong>{{ .Token }}</strong></p>
<p>If you did not request this, ignore this email. Do not share this code.</p>
```

Use the **Reset Password** template, not the Magic Link template. The application calls resetPasswordForEmail and verifies with `type: recovery`; it never uses OTP signup for password recovery. The UI accepts 6 to 10 numeric digits to accommodate the configured OTP length. Set expiry and rate limits in Supabase; the 60-second resend timer in the UI is only a convenience, not a server security control. Configure custom SMTP for delivery to real users and check provider/domain restrictions and sender verification. The Supabase built-in sender is limited and is not a production delivery guarantee.

Changing this shared template affects all clients using password recovery in this Supabase project. Review other consumers before changing it. Existing reset-link messages issued before the template change are not consumed by the new code-entry UI; request a new code.

## 3. Verify before release

- Google: existing Admin and Editor, user without a role, cancelled consent, provider disabled, expired callback, web redirect and Android cold/warm callbacks.
- Recovery: registered and unknown email (same neutral success copy), invalid/expired/reused code, resend rate limiting, password confirmation, password policy rejection, leaving recovery after verification, old password rejection and new password acceptance.
- Confirm Editor cannot access role management and anonymous/unassigned users cannot CRUD campus data or photos. The new public routes do not change RLS.
- Run admin tests, lint and production build, then `npm.cmd run android:sync`. Rebuild/install the separate admin APK for device verification.

Cloud provider settings, SMTP delivery and real Google/device flows require live account verification and are not established by mocked tests.

References: https://supabase.com/docs/guides/auth/social-sign-in/auth-google ; https://supabase.com/docs/guides/auth/auth-email-templates ; https://supabase.com/docs/guides/auth/native-mobile-deep-linking
