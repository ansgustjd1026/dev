# Shate Apps in Toss Launch Readiness

Last checked: 2026-09-01

## Current bundle

- App type: non-game
- `appName`: `shate`
- Bundle command: `npm run toss:bundle`
- Latest local bundle: `toss-app/shate.ait`
- Bundle build: passed
- Bundle size rule: under 100 MB after extraction

## Must complete before submitting for review

### 1. Enable Toss Login and install the mTLS credentials

The mini app uses `TossAuth.login`, exchanges the authorization code only on the Shate server, and creates a mapped Supabase session without exposing tokens in a URL.

- Enable Toss Login in the Apps in Toss console.
- Register the consent and privacy-policy URLs in the console.
- Run `supabase/toss_app_login_and_iap.sql` in Supabase SQL Editor.
- Run `supabase/admin_notifications.sql` if administrator notifications are enabled.
- Base64-encode the issued certificate and private key, then set `TOSS_MTLS_CERT_BASE64` and `TOSS_MTLS_KEY_BASE64` on Render.

Reference: https://developers-apps-in-toss.toss.im/login/develop.html

### 2. Register Apps in Toss subscription products

The mini app uses Apps in Toss subscription purchase and validates every grant against Toss's server-side order-status API before a plan is applied.

- Create Starter and Pro products in the Apps in Toss console.
- Set the generated SKUs as `TOSS_IAP_STARTER_SKU` and `TOSS_IAP_PRO_SKU` on Render.
- Set matching `VITE_TOSS_IAP_STARTER_SKU` and `VITE_TOSS_IAP_PRO_SKU` values before bundling the mini app.
- Verify completed purchase, pending-order recovery, cancellation, and restoration after device changes.

Reference: https://developers-apps-in-toss.toss.im/checklist/app-nongame.html

### 3. Keep the experience inside the mini app

The mini app no longer opens the external Shate editor or passes Supabase tokens to it. Automatic script, speech, caption, image-video rendering, project playback, retry, YouTube publishing, credits, settings, notifications, and subscription purchase all stay in the mini app.

- Add the production URL ending in `/api/toss/youtube/callback` to Google OAuth redirect URIs.
- Validate Toss Login, automatic creation, YouTube OAuth, publish, notification deletion, and IAP on a physical device.

### 4. Complete console and operational material

- Verify the console `appName` is exactly `shate`.
- Upload light and dark app icons and final screenshots.
- Upload at least three portrait screenshots at 636x1048 or larger and one landscape screenshot at 1504x741 or larger.
- Set category to `생활 > 콘텐츠 > 영상` and app type to non-game.
- Prepare service description, customer-support contact, terms of service, and privacy policy.
- Prepare a reviewer test account only if the submitted flow needs one.
- Test all key paths in both Sandbox and the real Toss app.

## Already prepared

- Apps in Toss WebView bundle configuration
- Light and dark icon assets
- Toss Login client, mTLS server exchange, and account mapping
- Apps in Toss subscription client and server-side order validation
- Full automatic creation pipeline without external token handoff
- Project playback, incomplete-project retry, and YouTube publishing
- Credit usage, production preferences, and persistent notification controls
- CORS allowlist for `*.apps.tossmini.com`
- Local production bundle build

## Review timing

Apps in Toss states that app review covers service eligibility, functionality, design, and security. The published estimate is 3-5 business days, excluding weekends and holidays.
