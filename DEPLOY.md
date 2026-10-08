# Deploying Global Monopoly on Vercel

This puts the game on the internet, so friends can play online together from any browser, phone or
computer. The one-device game works without any of this.

You need:

- a GitHub account;
- a Vercel account (the free Hobby plan is enough; sign up with GitHub at
  [vercel.com/signup](https://vercel.com/signup));
- about 15 minutes.

Online play needs a small database for the rooms, Upstash Redis, which you add from the Vercel
dashboard in step 3. Its free plan is enough for friends playing together.

These steps were checked against the Vercel and Upstash documentation in October 2026. If a button
has moved, its name is usually the same.

## 1. Put the code on GitHub

1. On github.com, create a new, empty repository (no README, no licence). Create it under your
   personal account, not under an organization: the Hobby plan cannot deploy a private repository
   that belongs to an organization.
2. From the project folder, run:

   ```bash
   git branch -M main
   git remote add origin https://github.com/<you>/<repository>.git
   git push -u origin main
   ```

   The work is on a branch called `milestones`. The first line renames it to `main`, the branch
   Vercel publishes as your live site. If `git push` asks you to sign in, run `gh auth login` first
   (GitHub CLI), or publish the folder with GitHub Desktop instead.

## 2. Create the Vercel project

1. Open [vercel.com/new](https://vercel.com/new) and sign in with GitHub.
2. Under **Import Git Repository**, find your repository and press **Import**. If it is not listed,
   use the link under the list to give Vercel access to it on GitHub.
3. Vercel detects the settings. Leave them as they are:
   - Framework Preset: **Vite**
   - Root Directory: `./`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

   The Node.js version (24.x) comes from `package.json`.
4. Press **Deploy** and wait for "Congratulations". Your address is shown, for example
   `https://global-monopoly.vercel.app`. This production address is the one to share; the project's
   **Overview** page lists it under **Domains**.

The game already works on one device. Online play shows "Online play is not set up on this server
yet." until you finish step 4.

## 3. Add Upstash Redis (the rooms)

1. Open [vercel.com/marketplace/upstash](https://vercel.com/marketplace/upstash) and press
   **Install**. (Or, in your project, open **Storage** in the sidebar, press **Create Database** and
   choose **Upstash for Redis**.)
2. If a dialog lists products, pick **Upstash for Redis** and press **Install**. Accept the terms if
   asked.
3. Choose the settings, pressing **Continue** and then **Create** when the screens ask:
   - Primary region: US East, shown as N. Virginia (`us-east-1`) or Washington, D.C. (`iad1`).
     Your functions run there unless you changed it.
   - Plan: **Free**.
   - Database name: anything, for example `global-monopoly-rooms`.
4. On the database page, open **Projects** and press **Connect Project**. Pick your project, keep
   **Production**, **Preview** and **Development** ticked, and leave **Custom Prefix** empty. Press
   **Connect**. (If Vercel already asked for a project while creating the database, this is done.)
5. Check it: in your project, open **Settings → Environment Variables**. You should see
   `KV_REST_API_URL` and `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN`. The game reads either pair, and you never need to copy them anywhere.

## 4. Redeploy

New environment variables only reach the functions in a new deployment.

1. In your project, open **Deployments** in the sidebar.
2. On the newest deployment, press the **⋯** menu, then **Redeploy**.
3. In the **Redeploy to Production** window, press **Redeploy**, and wait until it shows **Ready**.

## 5. Check it

1. Open `https://<your-address>/api/health` in a browser. You should see `"store":"upstash"`, for
   example `{"ok":true,"store":"upstash","now":1791451200000}`.
   - `{"ok":false,"store":"none"}` means the functions cannot see the database yet: check step 3.5,
     then redeploy (step 4).
2. From the project folder on your computer, run the smoke test against your address:

   ```bash
   npm install          # once, if you have not already
   npm run smoke -- https://<your-address>
   ```

   It creates a room, joins two seats, plays a few moves and checks that both seats see the same
   game and that live updates arrive. The last line should be
   `Smoke test passed. Room ABCD will expire on its own in 48 hours.`

If the smoke test (or your browser) is asked to log in to Vercel, you used a deployment-specific
address, the kind with a random part such as `global-monopoly-a1b2c3-you.vercel.app`. Vercel protects
those by default. Use the production address from step 2 instead. To test a protected address
anyway, open **Settings → Deployment Protection**, create a secret under **Protection Bypass for
Automation**, and run:

```bash
VERCEL_AUTOMATION_BYPASS_SECRET=<the secret> npm run smoke -- https://<that-address>
```

## 6. Play with friends

1. Open your address and press **Play online → Create room**.
2. Press **Share link** (on a phone this opens the share sheet), or **Copy link**, and send it.
3. Everyone opens the link, types a name and takes a seat. Two people on one laptop can press
   **Add a player on this device**.
4. The host picks the settings and presses **Start game**.

If someone's browser closes, they open the same link again and are back in their seat. If they
switch devices, the join screen offers to take over their (disconnected) seat. The host can also
**Play for them** or **Remove** them.

## Limits and costs

Checked in October 2026; the providers' pricing pages have the current numbers.

- **Rooms close 48 hours after the last move.** There are no accounts and nothing else is stored.
- **Live updates use Server-Sent Events.** Each connection lasts up to 4.5 minutes and then
  reconnects by itself, without missing a move. On the Hobby plan a function can run for 300 s at
  most; the game stays under that.
- **Upstash free plan:** 500,000 commands a month, 256 MB of data and 10 GB of transfer
  ([pricing](https://upstash.com/pricing/redis)). Measured against a real Redis, a move costs about 6
  commands with three players connected, and each connected device costs about 7 commands a minute
  while idle (heartbeats). One hour of a three-player game is about 4,000 commands, so the free plan
  covers roughly 125 such hours a month. Pay-as-you-go costs $0.20 per 100,000 commands.
- **Vercel Hobby plan:** 360 GB-hours of function memory, 4 hours of active CPU and 1,000,000
  function calls a month ([pricing](https://vercel.com/docs/functions/usage-and-pricing)). Memory is
  the one that matters here: an open live-update connection keeps a 2 GB function instance running,
  and Vercel shares an instance between connections when it can. An hour of play with four devices
  therefore uses about 2 to 8 GB-hours, so the plan covers roughly 45 to 180 hours of four-player
  games a month. A tab left in the background closes its connection after 10 minutes and catches up
  when you come back. If the Hobby allowance runs out, online play pauses until 30 days have passed;
  the one-device game keeps working. The dashboard's **Usage** page shows where you stand.

## Running it on your own computer

No Vercel and no Redis needed:

- `npm run dev:online`: the game at http://localhost:5173 with the API in memory.
- `npm run build && npm run serve:online`: the built game at http://localhost:4175.

Rooms then live only as long as that command runs.
