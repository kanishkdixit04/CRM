# SpikiTech Bootcamp CRM

Supabase-backed parent engagement CRM for the three-day AI, Public Speaking and Communication Bootcamp.

## What is included

- Lead tracker with Lead ID generation, student/parent fields, counselor ownership and terminal stages.
- Day 1 and Day 2 assessment loops with feedback follow-up.
- Day 3 certificate counseling, parent meeting pitch and slot booking.
- Day 4 certificate delivery plus parent story/post tag request.
- Post-bootcamp next-day conversion or nurture activity.
- KRA/KPI table seeded into Supabase.
- Priority queue, lead scoring, escalation flags, pending data-correction tasks and cycle reports.

## Local app

```bash
npm install
npm run dev -- --port 5173
```

Open:

```text
http://127.0.0.1:5173
```

## Supabase setup

The app is already pointed at:

```text
https://jozkatvurojtajcxjmet.supabase.co
```

For hosted deployments, set these environment variables if your platform supports them. The app also has public fallbacks for the same project, so a missing env file should not create a blank screen.

```text
VITE_SUPABASE_URL=https://jozkatvurojtajcxjmet.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable__KCVSGfedr7Z8AdVOTvCfw_rBu7giXu
VITE_LOGIN_ID=spikitechvivudh.com
VITE_LOGIN_EMAIL=admin@spikitechvivudh.com
```

Apply the schema with the real database password from Supabase Project Settings:

```bash
npx supabase login
npx supabase link --project-ref jozkatvurojtajcxjmet --password "<DATABASE_PASSWORD>"
npx supabase db push --linked --password "<DATABASE_PASSWORD>"
```

The remote project has been linked and the first CRM migration has been pushed.

## Auth

RLS policies allow authenticated users only. The app login screen accepts a Login ID and password, then signs in to a Supabase email/password auth account behind the scenes.

Default visible Login ID:

```text
spikitechvivudh.com
```

The mapped Supabase auth email is configured with:

```text
VITE_LOGIN_EMAIL=admin@spikitechvivudh.com
```

## Main KRA/KPI flow

1. Day 0: registration verification, Lead ID, counselor ownership, first callback.
2. Day 1: first assessment, score, mentor notes, parent feedback.
3. Day 2: second assessment, participation, pain points, parent progress feedback.
4. Day 3: certificate counseling pitch, parent meeting, slot booking.
5. Day 4: send certificate and ask parent to tag SpikiTech in story/post.
6. Post Bootcamp: next-day progress summary, program recommendation, payment or nurture follow-up.
