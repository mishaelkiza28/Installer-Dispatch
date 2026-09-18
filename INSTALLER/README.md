# Work Order Dispatch

A standalone platform for assigning and dispatching work orders to
field technicians. Dispatchers work from a web console; technicians
never install or open anything — every dispatch and every status
update travels over SMS, WhatsApp, and email, using their existing
phone number.

## How it works

1. A dispatcher creates a work order and assigns a technician in the
   console.
2. Clicking **Dispatch** sends the job to that technician on whichever
   channels they're reachable on, and moves the work order to
   `dispatched`.
3. The technician replies from their ordinary messaging app:
   - `ACK` (or `1` / `OK`) → work order moves to `acknowledged`
   - `START` → moves to `in_progress`
   - `DONE` (or `COMPLETE`) → moves to `completed`
4. The dispatcher marks a completed job **verified** once they've
   confirmed it, closing the loop.
5. Every outbound message and every inbound reply is written to
   `notification_log` — open a work order's timeline in the console to
   see the full back-and-forth.

Nothing here requires a technician to have an app, log in, or be
online in any special way beyond having phone signal.

## Project layout

```
supabase/migrations/0001_init.sql     — schema: technicians, work_orders, notification_log
supabase/functions/dispatch-work-order — sends the notification(s) and advances status to "dispatched"
supabase/functions/sms-inbound         — Africa's Talking inbound SMS webhook
supabase/functions/whatsapp-inbound    — Meta Cloud API inbound WhatsApp webhook
src/                                   — the dispatcher web console (Vite + React + TypeScript + Tailwind)
.github/workflows/deploy.yml           — builds the console and publishes it to GitHub Pages
```

## 1. Set up Supabase

1. Create a new Supabase project (this is deliberately a separate
   project from Solar Garage — nothing here depends on it).
2. In the SQL editor, run `supabase/migrations/0001_init.sql`.
3. Create your own dispatcher login: Authentication → Users → Add
   user. Any authenticated user can manage the whole system for now
   (see the RLS policies in the migration if you later want more than
   one role, e.g. read-only office staff).
4. Copy `.env.example` to `.env.local` and fill in your project URL
   and anon key (Project Settings → API).

## 2. Set up notification providers

**SMS — Africa's Talking.** Sign up at africastalking.com, create an
app, and grab your username + API key. Local routing to MTN/Airtel
Uganda numbers runs roughly UGX 20–35 per SMS — a fraction of a US
cent — dramatically cheaper than Twilio/Plivo/similar international
gateways, which route Uganda traffic at $0.11–0.26 per SMS.

**WhatsApp — Meta Cloud API.** Create a Meta Business account, add a
WhatsApp Business phone number, and get a permanent access token
(Meta's docs walk through this — it changes occasionally, so follow
their current flow rather than a fixed set of steps here). You'll also
need to create and get approval for a message template (Meta Business
Manager → WhatsApp Manager → Message Templates) — business-initiated
messages can't use free-form text. There's no subscription fee for API
access itself, just a small per-message rate that varies by country
and message category — check the live rate card at
developers.facebook.com before relying on a specific number, since
Meta revises it periodically. One important date: **from October 1,
2026, Meta starts charging for every message, including replies sent
within what used to be a free 24-hour window** — budget for WhatsApp
as a paid channel from day one.

**Email — Resend.** Sign up at resend.com and create an API key. The
free tier comfortably covers this volume; it's the only channel here
that's genuinely $0.

Set all of these as Edge Function secrets — see
`supabase/functions/.env.example` for the full list and the exact
command. Don't put them in a `.env` file; Edge Functions don't read
one in production.

## 3. Deploy the Edge Functions

```bash
supabase functions deploy dispatch-work-order
supabase functions deploy sms-inbound
supabase functions deploy whatsapp-inbound
```

If you haven't already, link the CLI to your project first
(`supabase link --project-ref <your-project-ref>`) — that's what makes
it pick up `supabase/config.toml`, which turns off the platform's
automatic JWT check for all three functions. That check normally
protects an endpoint from anonymous callers, but here it actively
breaks things: it also blocks the CORS preflight request the browser
sends before `dispatch-work-order` (preflights never carry an
Authorization header), and it would reject every inbound webhook from
Africa's Talking or Meta outright, since neither can send a
Supabase-issued JWT. `dispatch-work-order` validates the caller's
session itself instead, so it stays restricted to signed-in
dispatchers despite the platform check being off.

Then register the webhook URLs each provider gives you:
- Africa's Talking dashboard → SMS → your shortcode → set the
  **Callback URL** to your deployed `sms-inbound` function URL.
- Meta Business Manager → WhatsApp → Configuration → Webhook → set the
  URL to your deployed `whatsapp-inbound` function, and the verify
  token to whatever you set as `WHATSAPP_VERIFY_TOKEN`.

## 4. Run the console locally

```bash
npm install
npm run dev
```

Sign in with the dispatcher account you created in step 1.

## 5. Host the console on GitHub Pages

GitHub Pages only serves static files, so this deploys the `src/`
console — a plain HTML/JS/CSS bundle once built. It does **not** and
cannot host `supabase/functions/`; those stay deployed on Supabase
exactly as in step 3, regardless of where the console itself lives.
The console just calls out to your Supabase project's URL from the
browser, so the two are independent.

1. **Push this project to a GitHub repository** (new repo, then the
   usual `git init && git add . && git commit -m "init" && git remote
   add origin <your-repo-url> && git push -u origin main`).

2. **Add two repository secrets** — Settings → Secrets and variables →
   Actions → New repository secret:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   (the same two values from your `.env.local`). These get baked into
   the static build at compile time — that's expected and safe, since
   the anon key is designed to be public; Row Level Security is what
   actually protects the data, not keeping this key secret.

3. **The workflow is already included** at
   `.github/workflows/deploy.yml` — it builds the app with those
   secrets and publishes `dist/` on every push to `main`. You don't
   need to write or copy anything for this step.

4. **Turn on Pages** — repo Settings → Pages → under "Build and
   deployment", set **Source** to **GitHub Actions** (not "Deploy from
   a branch"). Nothing else to configure here.

5. **Push to `main`.** The workflow runs automatically; watch it under
   the Actions tab. When it finishes, the same Settings → Pages screen
   shows your live URL — either `https://<username>.github.io/<repo>/`
   or `https://<username>.github.io/` if the repo is named
   `<username>.github.io`. `vite.config.ts` already uses a relative
   base path, so it works at either without editing anything.

6. **Re-deploy after any future change** by just pushing to `main` —
   or trigger it manually from the Actions tab (the workflow has
   `workflow_dispatch` enabled) if you need to force a rebuild without
   a new commit.

One thing worth doing before this goes live: GitHub Pages sites are
public to anyone with the URL (private-repo Pages needs a paid GitHub
plan, and even then the site itself is still just static files with no
access control of its own). The console has no signup form, but
Supabase Auth's email/password sign-up is enabled by default at the
API level — worth turning it off (Authentication → Sign In / Providers
→ Email → disable "Allow new users to sign up") so account creation
stays something only you do from the dashboard, since the actual
dispatcher accounts are the only gate standing between a visitor and
your data once the console is reachable by anyone.

## No-cost alternative

If you want to run this with zero notification spend while you're
testing, or as a permanent lower-cost mode: skip the WhatsApp and SMS
secrets entirely. `dispatch-work-order` degrades gracefully — it only
sends on the channels a technician has an address for and a secret
configured for, so with only `RESEND_API_KEY` set, every dispatch goes
out by email at no cost. The trade-off is real: email doesn't get
opened as promptly as a text message, so a technician might not see an
urgent job right away. A Telegram bot (not included here, but simple
to add following the same pattern as `sms-inbound`) is the other
genuinely free option — no per-message cost ever — at the price of
each technician installing Telegram once, which is a bigger ask in
Uganda than WhatsApp.

## Troubleshooting

**"Could not reach the dispatch function" in the console.** This is a
browser-level failure (the `fetch()` never got a response), not an
error from your code — almost always one of:

1. The function isn't deployed yet — check Supabase Dashboard → Edge
   Functions for `dispatch-work-order`. If it's missing, deploy it
   (step 3).
2. `supabase/config.toml` hasn't taken effect — it only applies on
   deploy, and only if the CLI is linked to your project
   (`supabase link --project-ref <ref>`). Redeploy after linking.
3. To confirm which: Dashboard → Edge Functions → `dispatch-work-order`
   → Logs. **Zero log entries for your attempt** means the platform's
   JWT gate blocked the request before your code ran (cause 2, above)
   — the function never actually executed.

## Extending it

- **Multiple dispatchers with different permissions** — split the
  single `authenticated` RLS policy into role-specific ones.
- **Recurring/scheduled work orders** — add a `pg_cron` job that
  inserts new work orders on a schedule and calls `dispatch-work-order`
  automatically.
- **Photo proof of completion** — WhatsApp media messages can be
  captured in `whatsapp-inbound` (the payload includes an `image`
  field with a media ID) and stored in Supabase Storage.
