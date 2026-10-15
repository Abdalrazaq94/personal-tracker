# Tracker — personal tracker (Vite + React + Supabase)

Mobile-first, black & white personal tracker with email + password login.

**Features**
- **Words** – search bar at the top; type **or say** a new word (microphone) and it is **translated to Arabic automatically**; colour each box: brown = not yet, blue = learning, green = memorized; hear any word read aloud; **✦ Explain** a word with AI (meaning, examples, synonyms, tip).
- **Practise words** – *Fill the gap*: AI writes a sentence with a missing word, you type or say it. *Make a sentence*: you write or say your own sentence and the AI corrects it (English + Arabic feedback). Update each word's colour at the end.
- **Daily tasks** – Important / Normal, To do / Doing / Done, "Important on top", delete, **AI analysis**.
- **Habits** – daily target, tap + / − to log today, 7-day history, streak, days done, total times.
- **Spending** – totals for today, this week, this month and all time, **AI analysis**.
- **Plan** – plan tasks for today, tomorrow or any date; mark done or delete.
- **Saved links** – make your own sections (YouTube, TikTok, …), paste links and see a picture preview like Trello; edit, move, delete.
- **Notes** – make notebooks (e.g. "Daily notes") with note cards inside; add, edit, delete, search.
- **Jobs applied** – shows your Trello jobs board; add jobs and move them between lists.

Everything runs on free plans: **Supabase** (database + login), **Vercel** (hosting), **Google Gemini** (AI).

---

## 1. Database (Supabase)

1. Sign up at https://supabase.com → **New project** (name `tracker`, region **London**).
2. **SQL Editor → New query** → paste everything from `supabase/schema.sql` → **Run**.
   (Safe to run again later when new features add tables.)
3. **Authentication → Sign In / Providers → Email** → turn off **Confirm email**.
4. Click **Connect** (top of the project) and copy the **Project URL** and the **public key** (`anon` / `Publishable`).

## 2. Run it on your computer

Needs Node.js 18+.

```bash
cp .env.example .env      # paste the URL and key into .env
npm install
npm run dev
```

On your phone (same Wi-Fi): `npm run dev -- --host` and open the "Network" address.

After you have created **your own account**, you can stop strangers from signing up:
**Authentication → Sign In / Providers → turn off "Allow new users to sign up".**

## 3. AI analysis (optional, free)

The AI runs in a small Supabase **Edge Function** so your AI key stays secret.

1. Get a free key at https://aistudio.google.com/apikey (Google account needed).
2. In Supabase: **Edge Functions → Secrets** → add `GEMINI_API_KEY` = your key.
   (Prefer Claude? Add `ANTHROPIC_API_KEY` from https://console.anthropic.com instead — paid per use, a few pence per hundred analyses.)
3. **Edge Functions → Deploy a new function → Via Editor**, name it exactly `ai`,
   replace the example code with everything from `supabase/functions/ai/index.ts`, and click **Deploy**.
4. Open the `ai` function → **Details / Settings** → turn **off** "Verify JWT" (the function checks the logged-in user itself) → Save.

Or with the CLI: `npx supabase login`, `npx supabase link`, `npx supabase functions deploy ai`
(the `supabase/config.toml` already turns off Verify JWT).

Then tap **Analyse with AI** on the Tasks or Spending page. The same function powers the Arabic auto-translation, ✦ Explain and Practise on the Words page.

**Microphone:** voice input uses the phone's built-in speech recognition (Chrome on Android, Safari on iPhone). It only works on an `https://` address (your Vercel link) or `localhost`; the browser asks for microphone permission the first time.

## 4. Jobs applied (Trello)

Done inside the app — open **Jobs** and follow the 3 steps on screen:
1. https://trello.com/power-ups/admin → **New** → any name → **API key** → copy.
2. Paste it, tap **Get token**, click **Allow**, copy the token, paste it.
3. **Load boards** → pick your jobs board → **Save**.

Your key and token are stored in your own row in the database (only your account can read it).

## Google Wallet auto-add (Android, optional)

Payments made with Google Wallet appear in Spending by themselves.

1. **Database:** run `supabase/migrations/004_wallet_ingest.sql` in the SQL Editor.
2. **Function:** Edge Functions → Deploy a new function → Via Editor → name it `ingest` → paste `supabase/functions/ingest/index.ts` → Deploy. Then open its settings and turn **Verify JWT off** (it is protected by your private key instead).
3. **App:** Spend → **Google Wallet** → *Create my private key* → *Send test* (should say "It works!").
4. **Phone:** install **MacroDroid** → allow Notification access → new macro:
   - Trigger: *Notification received* → app **Google Wallet**
   - Action: *HTTP Request* → **POST** to the URL shown in the app, content type `application/json`, body copied from the app.

The key only lets someone **add** spending to your account, not read anything; use *New key* if it ever leaks.

## 5. Put it online (Vercel, free)

1. Push this folder to GitHub.
2. https://vercel.com → **Add New → Project** → import the repo (Vite is detected).
3. **Environment Variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_CURRENCY` (e.g. `GBP`).
4. Deploy. Every new push to GitHub updates the site automatically.

## 6. Add to your phone's home screen

- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** ⋮ → **Add to Home screen**.

## Notes

- Link previews: YouTube pictures come straight from YouTube; other sites use the free microlink.io preview service (about 50 previews a day). If a preview can't be loaded the link still saves, with the site name instead of a picture.
- Never put the Supabase **service_role / secret** key in this app.
- Free Supabase projects pause after 7 days with no use — open the dashboard and click **Restore**.


## Commitments: prayer times

**Commit** → choose any city (search, or "Use my location"). It shows the 5 prayer times for that day
(Fajr, Dhuhr, Asr, Maghrib, Isha), the next prayer, and the Hijri date. Mark each prayer as **On time**, **Late**
(still in its time), **Qada** (made up after its time) or **Didn't pray**; tap the same answer again to undo.
Qada and Didn't pray appear once a prayer's time has passed (Fajr's ends at sunrise). **Last 7 days** shows every
prayer at a glance. Needs `supabase/migrations/014_prayer_status.sql` (without it only On time / Late work).

Times are calculated on your device with the free [adhan](https://github.com/batoulapps/adhan-js) library; pick the
method your mosque uses (default: Moonsighting Committee) and Standard or Hanafi Asr. City search uses the free
Open-Meteo geocoding service.

**Analyse with AI** (on the same page) shows a line chart of the last 30 days (prayed and on time per day),
how often each prayer was prayed or late, and an AI review with tips. It needs the updated `ai` Edge Function.

Setup (once): run `supabase/migrations/006_prayers.sql` in Supabase → SQL Editor, and redeploy the `ai` function.

## Monthly budget

**Spend** → **Set budget**. The card shows what's left, how much you can spend per day for the rest of the month,
where your current pace ends up, and what most of the money went on. Home shows "£X left". With Reminders on, you
get one warning at 80% and one when you go over (each once a month, between 08:00 and 22:00).
Setup: run `supabase/migrations/015_budget.sql` and redeploy the `notify` and `ai` functions.

## Reminders (phone notifications)

Plans with a time remind you at that time (or 15 min / 1 hour / 1 day before). **Important** plans repeat every
5 minutes until you tap **Done** or **Postpone** (on the notification or in the app). Prayers can remind you at each
prayer time and repeat every 10 minutes until you mark them.

Setup (once):
1. Supabase → SQL Editor: run `supabase/migrations/008_reminders.sql` (adds the tables and a job that runs every minute).
2. Supabase → Edge Functions: deploy `supabase/functions/notify` (one file) with **Verify JWT off**.
3. In the app (on your phone): **Reminders → Turn on reminders → Send a test**. For prayers, choose your city in
   Commitments, then switch prayer reminders on.

Works in Chrome on Android and on computers; on iPhone, add Tracker to the Home Screen first (iOS 16.4+).

## Arabic interface (العربية)

Switch **English | العربية** in the ☰ menu (or the top bar on a computer, or the sign-in page). The whole app turns right-to-left with an Arabic font and Arabic dates; the choice is saved to your account so every device follows it.

- Texts live in `src/i18n/ar1.js`–`ar3.js` (the English text is the key). In code, wrap new text with `T('…')`, or `Tr('… {0} …', <b>part</b>)` when part of the sentence is JSX.
- AI answers (“Your day”, analysis) come back in Arabic — redeploy the `ai` function.
- Reminders arrive in Arabic — run `supabase/migrations/013_lang.sql` and redeploy the `notify` function.
