# Project Structure

## Root

```text
shorts-auto-site-shate/
├── app/              Next.js pages, components, and API routes
├── lib/              Shared server, AI, Supabase, billing, and media logic
├── public/           Web app images and static assets
├── scripts/          Maintenance scripts
├── supabase/         SQL migrations and operational SQL
├── test/             Shared test setup and stubs
├── toss-app/         Independent Apps in Toss mini app
├── docs/             Deployment and operational documentation
├── Dockerfile        Render production image
├── render.yaml       Render service configuration
└── package.json      Web app commands and dependencies
```

## Web App

```text
app/
├── api/              Server endpoints grouped by feature
├── admin/            Admin dashboard
├── components/       Reusable web UI
├── create/           Guided project creation flow
├── dashboard/        Project dashboard and automatic creation entry
├── profile/          Account, channel, subscription, and settings
└── settings/         User preferences
```

## Apps in Toss

```text
toss-app/
├── src/              Mini app React source
├── public/           Mini app static assets
├── screenshots/      Console submission screenshots
├── apps-in-toss.config.ts
├── LAUNCH_READINESS.md
└── shate.ait         Generated upload bundle, intentionally ignored by Git
```

## Operating Rules

- Keep runtime configuration files in the root. Do not place secret files in the repository.
- Add SQL changes as a new, clearly named file in `supabase/`; do not overwrite previously applied SQL.
- Keep Toss-only code and dependencies inside `toss-app/`. The root Next.js build excludes this independent package.
- Store release screenshots in `toss-app/screenshots/` and regenerate `shate.ait` after changing Toss client settings or product SKUs.
