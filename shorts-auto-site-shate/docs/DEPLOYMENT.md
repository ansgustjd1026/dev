# Shate Beta Deployment

## Render

1. Create a Render Web Service from this private GitHub repository. Render detects `render.yaml` and the Dockerfile.
2. Use a paid instance suitable for FFmpeg rendering. The free instance is not appropriate for beta video rendering.
3. Add these environment variables in Render. Never commit their values.

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ADMIN_EMAILS=
BILLING_ENABLED=false
```

`FFMPEG_PATH` is not necessary in the Docker deployment because the image installs FFmpeg.

## Supabase

Run the required SQL files in the Supabase SQL Editor before opening beta access. At minimum, run the plan, profile, credit, storage, YouTube, suspension, and default-Free-plan migrations in the `supabase/` directory.

After the Render URL is available, set it as the Supabase Auth Site URL and add these redirect URLs:

```text
https://YOUR_RENDER_URL/login
https://YOUR_RENDER_URL/profile
https://YOUR_RENDER_URL/api/youtube/callback
```

## Google OAuth Redirects

In Google Auth Platform > Clients, open the web client matching `GOOGLE_CLIENT_ID`.
Add both addresses under **Authorized redirect URIs** (not JavaScript origins):

```text
https://YOUR_RENDER_HOST/api/youtube/callback
https://YOUR_RENDER_HOST/api/toss/youtube/callback
```

Render supplies `RENDER_EXTERNAL_URL` automatically. The YouTube routes use it
for authorization, token exchange, and web return redirects because the internal
Next.js request URL can contain `localhost:10000`. Do not register that internal
address in Google Cloud. See [Render's environment variables](https://render.com/docs/environment-variables).

For a custom domain or another host, set `APP_BASE_URL` to the public origin
(for example, `https://shate.example.com`) and register the same callback paths
on that origin. It takes precedence over `RENDER_EXTERNAL_URL`. Start the OAuth
flow on that same domain so the web session and state cookies remain available.
Without either variable, local development uses the request origin, such as
`http://localhost:3000`.

## Retired YouTube Analysis

YouTube history and audience analysis have been removed. Existing deployments can
run `supabase/remove_youtube_audience_insights.sql` after deploying this version to
permanently delete the unused analysis cache. The application no longer reads or
writes it, so cleanup is not required for the application to work. YouTube account
connections and publishing records are retained. New OAuth requests omit the
Analytics scope; existing Google grants are not automatically revoked.

## Beta Plan Policy

Every new account receives Free with 10 monthly credits. Administrators assign Starter or Pro from the admin screen. Keep `BILLING_ENABLED=false` until payments are ready.
