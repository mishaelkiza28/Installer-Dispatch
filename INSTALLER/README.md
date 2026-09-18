# Installer Dispatch

A small, standalone platform for **receiving work orders and dispatching them to installers by email**.

- The office works from a web console: work orders come in by typing them up or importing a spreadsheet, get assigned to an installer, and are emailed out with one click.
- Installers never log in or install anything. Each job email has **Accept / Can't take it / I'm on site / Job done** buttons. A tap opens a simple mobile page, they confirm, and the office board updates live.
- The office gets an email whenever an installer accepts, declines or finishes a job.
- Every step is kept in a per-job history.

All notifications are email only, sent through a Gmail account (free, no domain needed).

## How a job moves

```
 Unassigned ──Email──▶ Emailed ──Accept──▶ Accepted ──On site──▶ On site ──Done──▶ Done ──Verify──▶ Verified
     ▲                    │                   │                     │
     └──── Decline / Recall (office) ◀────────┴─────────────────────┘      Cancel from any open state
```

| Who | Action | What happens |
|---|---|---|
| Office | **Email** (single or "Email N ready") | Installer gets the job email; the job moves to *Emailed* |
| Installer | **Accept** | *Accepted*, office emailed |
| Installer | **Can't take it** (optional reason) | Back to *Unassigned* with a "Declined by…" note, links stop working, office emailed |
| Installer | **I'm on site** | *On site* |
| Installer | **Job done** (optional note) | *Done*, office emailed |
| Office | **Mark verified** | *Verified* (closed) |
| Office | **Re-send email** | Same links re-sent as a reminder |
| Office | **Copy installer link** | Paste the job link into WhatsApp/SMS yourself if email is slow |
| Office | **Recall** | Back to *Unassigned*, installer told the job is withdrawn, links stop working |
| Office | **Cancel** / **Reopen** | Installer told if it was out with them |

## Setup (about 10 minutes)

The database and the two server functions are already deployed to the `Installer-Dispatch` Supabase project.
Three things are left, and only you can do them:

### 1. Let it send email from Gmail

1. Pick the Gmail account that should send the jobs. A dedicated one such as `tsgdispatch@gmail.com` is best, because installers will see it and reply to it.
2. On that account, turn on **2-Step Verification**: Google Account → Security.
3. Create an **app password**: Google Account → Security → 2-Step Verification → **App passwords**. Name it "Dispatch" and copy the 16-character password.
4. In Supabase, open the **Installer-Dispatch** project → **Edge Functions → Secrets** and add:

   | Name | Value |
   |---|---|
   | `GMAIL_USER` | the Gmail address |
   | `GMAIL_APP_PASSWORD` | the 16-character app password |
   | `EMAIL_FROM_NAME` *(optional)* | e.g. `TSG Solar Dispatch` |

Gmail allows about 500 emails a day, which is plenty for this.

### 2. Create your dispatcher login

Supabase → **Authentication → Users → Add user → Create new user**: enter your email (`mishaelkiza28@gmail.com` is already on the dispatchers list), set a password, and tick **Auto Confirm User**.

Only emails on the dispatchers list can see anything. You can add colleagues later under **Settings** in the console, then create their login the same way. Also turn off public sign-ups: **Authentication → Sign In / Providers → Email → "Allow new users to sign up"** off. (Strangers who sign up would see nothing anyway, but there's no reason to let them.)

### 3. Publish the console

Push this repo to GitHub. The workflow in `.github/workflows/deploy.yml` builds the console and publishes it to GitHub Pages:
**https://mishaelkiza28.github.io/Installer-Dispatch/**

If Pages isn't on yet, go to the repo's **Settings → Pages** and set **Source** to **GitHub Actions**.

The Supabase URL and publishable key are in `.env.production`. They're meant to be public, because the data is protected by row-level security. That means no GitHub secrets are needed, and any old `VITE_SUPABASE_*` secrets are ignored.

Then sign in, open **Settings**, check the company name, office phone and office notification emails, and click **Send test email**.

## Daily use

1. **Installers** page: add each installer's name and email. Phone and area are optional.
2. **Board → New work order**, or **Import** a spreadsheet.
3. Pick an installer on the card and click **Email**. For a batch, assign installers first, then click **Email N ready**.
4. Watch cards move as installers respond. "Emailed" cards turn amber after 4 hours with no reply. Re-send or call them.
5. When a job reaches **Done**, check it and click **Mark verified**.

### Importing a spreadsheet

**Import** accepts `.xlsx` or `.csv` files, or rows pasted straight from Excel or Google Sheets. The first row must be headings. Common names are recognised automatically, and you can fix the mapping before importing:

| Field | Headings it recognises |
|---|---|
| Title | Title, Job, Task, Work order |
| Job type | Job type, Type, Category, Service |
| Client name | Client, Customer, Name, Beneficiary |
| Client phone | Phone, Telephone, Mobile, Contact |
| Site / address | Address, Site, Location, Village, Plot |
| District / area | District, Area, Region, Town |
| Scheduled date | Date, Install date, Scheduled, Due (day first: `21/09/2026`, or `2026-09-21`, or Excel dates) |
| Priority | Priority, Urgency (`urgent`/`high` → urgent, `low` → low) |
| Notes | Notes, Description, Details, Instructions |
| Installer | Installer, Installer email, Technician, Assigned to (matched by email or name) |

If a row has no title, one is built from job type and client name. Rows with a matched installer arrive ready to email. **Template** downloads a sample CSV.

## Project layout

```
supabase/migrations/0001_init.sql         schema, guarded status transitions, row-level security
supabase/functions/work-order-action      office actions that email (dispatch, re-send, recall, cancel, test)
supabase/functions/installer-action       public endpoint behind the installer's email buttons
supabase/functions/_shared/email.ts       Gmail SMTP sender + the email templates
src/                                      console + installer job page (Vite, React, TypeScript, Tailwind)
.github/workflows/deploy.yml              builds and publishes to GitHub Pages on every push to main
```

### How it stays safe

- **Dispatchers**: every table is behind row-level security that checks the signed-in user's confirmed email against the `dispatchers` list.
- **Installers**: each dispatch creates a random 32-character token that goes only into that installer's email links. It stops working the moment the job is declined, recalled or cancelled. The installer page shows only that one job.
- **Status**: status can only change through `wo_transition()`, which enforces the allowed moves and writes the history. The browser can't set status or tokens directly.
- **Links**: email buttons open a confirmation page instead of acting immediately, so email link scanners can't accept jobs by accident.

## Running locally

```bash
npm install
npm run dev
```

`.env.production` is used for builds. For `npm run dev`, copy it to `.env.local`.

To redeploy the functions after changing them (Supabase CLI):

```bash
supabase link --project-ref <project-ref>
supabase functions deploy work-order-action --no-verify-jwt
supabase functions deploy installer-action --no-verify-jwt
```

Both functions check the caller themselves: the dispatcher's session for the first, the email token for the second. The platform's JWT check is therefore off; see `supabase/config.toml`.

## Troubleshooting

- **"Email isn't set up yet"**: the two Gmail secrets are missing. See step 1.
- **"Gmail rejected the login"**: use the 16-character app password, not the normal Gmail password, and make sure 2-Step Verification is on for that account.
- **Installer says the link doesn't work**: the job was probably recalled, declined or cancelled. Open the job and use **Copy installer link** or **Re-send email** to get the current link.
- **Installer didn't get the email**: ask them to check spam, and to add the sender to their contacts. Or use **Copy installer link** and send it by WhatsApp.
- **Board doesn't update by itself**: it also refreshes when you come back to the tab. Reloading always shows the latest.
