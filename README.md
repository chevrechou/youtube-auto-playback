# YouTube Auto-Playback

Keeps YouTube videos playing automatically: resumes paused videos, loops
the video when it ends, and dismisses "Continue watching?" prompts. Also
offers Zen Mode, which hides comments, recommendations, and end-screen
suggestions on watch pages, and Watch Together, which syncs playback with
someone else in real time. Click the toolbar icon to open a popup with
all three controls (badge shows Auto-Playback's ON/OFF state).

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable "Developer mode" (top-right toggle).
3. Click "Load unpacked".
4. Select this folder (`youtube-auto-playback`).

Auto-Playback and Zen Mode work immediately, no setup required. Watch
Together works out of the box too, as long as `constants.js` and
`manifest.json`'s `host_permissions` have already been pointed at a real,
deployed Worker + Firebase project (see Watch Together backend setup
below) — that's a one-time step for whoever maintains the shared backend,
not something each installer does.

## Watch Together backend setup (one-time, for maintainers)

**End users installing the extension do not need to do any of this.** Watch
Together talks to a single shared backend — a Cloudflare Worker plus a
Firebase Realtime Database — that the maintainer sets up once. The Worker's
URL and the Firebase project's public web config are baked into
`constants.js` and shipped with the extension, so anyone who installs it
(from source or the Chrome Web Store) gets Watch Together working with zero
configuration. The steps below are only for whoever maintains this repo's
shared backend, done once, not per-installer.

1. **Create the Firebase project.** Go to the
   [Firebase console](https://console.firebase.google.com/), create a
   project (free tier is enough), and add a **Realtime Database** to it
   (not Firestore — the older Realtime Database product). Note the
   database's URL, shown in the console (looks like
   `https://your-project-default-rtdb.firebaseio.com`).
2. **Apply the security rules.** Open the Realtime Database's **Rules** tab
   and paste in the contents of
   [`firebase-security-rules.json`](./firebase-security-rules.json) from
   this repo. Those rules scope every room so only a client whose auth
   token carries a matching `roomCode` claim can read or write it, with no
   rule allowing the top-level `rooms` collection to be listed or scanned.
3. **Generate a service-account key.** In the Firebase console, go to
   **Project Settings → Service Accounts → Generate new private key**.
   This downloads a JSON key the Worker uses to mint per-room custom
   tokens and perform admin writes — this key is an admin-equivalent
   credential that bypasses the security rules from step 2 (that's
   expected; the rules only constrain the extension client, not the
   Worker).
4. **Set up Cloudflare.** Create a free
   [Cloudflare](https://dash.cloudflare.com/sign-up) account and install
   the `wrangler` CLI (`npm install -g wrangler`, or use `npx wrangler`
   without a global install). Create the KV namespace the Worker uses for
   rate limiting:
   ```
   wrangler kv:namespace create WATCH_TOGETHER_KV
   ```
   Copy the namespace ID it prints into `worker/wrangler.toml`.
5. **Set the Worker's Firebase secret.** From inside `worker/`:
   ```
   cd worker
   wrangler secret put FIREBASE_SERVICE_ACCOUNT_KEY
   ```
   Paste the full contents of the service-account JSON from step 3 when
   prompted.
6. **Deploy once manually** to get the Worker's live URL:
   ```
   cd worker
   npx wrangler deploy
   ```
   Wrangler prints the deployed Worker's URL (something like
   `https://watch-together.<your-subdomain>.workers.dev`) — you'll need it
   next.
7. **Update the extension's constants.** In `constants.js`, set
   `WORKER_BASE_URL` to the URL from step 6, and set
   `FIREBASE_DATABASE_URL` / `FIREBASE_WEB_API_KEY` to this project's
   database URL (step 1) and its web API key (Firebase console →
   **Project Settings → General → Web API Key**).
8. **Update `manifest.json`'s `host_permissions`**, replacing the
   placeholder Worker domain with the real one from step 6, so the
   extension is permitted to call it.
9. **Wire up auto-deploy.** Add two repository secrets under
   **Settings → Secrets and variables → Actions** so future pushes that
   touch `worker/**` deploy automatically via
   [`.github/workflows/deploy-worker.yml`](./.github/workflows/deploy-worker.yml):
   - `CLOUDFLARE_API_TOKEN` — a Cloudflare API token with permission to
     edit Workers scripts.
   - `FIREBASE_PROD_SERVICE_ACCOUNT_KEY` — the same service-account JSON
     from step 3, so CI can push it as the Worker's secret on every
     deploy.
10. **Set up spend alerts as a safeguard.** Both platforms have a generous
    free tier, but it's worth capping surprises:
    - Cloudflare: **dash.cloudflare.com → Billing → Notifications**, add a
      usage alert.
    - Google Cloud Console (the Firebase project lives here too):
      **Billing → Budgets & alerts**, set a budget with email alerts.

## Manual test checklist

1. Open a YouTube video, let it play, then pause it — it should resume on
   its own within ~1 second.
2. Leave a video idle until the "Continue watching?" overlay appears —
   it should auto-dismiss.
3. Let a video play to the end — it should loop back to the start and
   keep playing instead of stopping.
4. Click the toolbar icon — a popup opens showing "Auto-Playback" and
   "Zen Mode" switches. Toggle "Auto-Playback" off; badge should switch
   to "OFF" and a paused video should now stay paused.
5. Toggle "Auto-Playback" back on — badge should switch back to "ON";
   confirm auto-resume behavior returns.
6. Toggle "Zen Mode" on while watching a video — comments, recommendations,
   and end-screen suggestions should disappear on that watch page.
7. Navigate to a different video (click a recommendation or search result)
   with Zen Mode still on — it should stay hidden on the new video without
   a full page reload.
8. Open a livestream with live chat visible, turn Zen Mode on — live chat
   and any playlist panel should remain visible (only recommendations
   should hide).
9. Visit a `/shorts/...` URL with Zen Mode on — the Shorts player should
   display normally, unaffected by Zen Mode.
10. Toggle "Zen Mode" off — hidden elements should reappear.
11. With a real, deployed Worker + Firebase project wired into
    `constants.js`/`manifest.json`, click "Create Room" in Watch Together
    on a YouTube watch page — a room code appears (returned by the
    Worker's `/watch-together/create`) with a "Waiting for someone to
    join…" status. Click "Copy" — the code should be copied to your
    clipboard.
12. In a second browser (or another Chrome profile) with the same
    extension installed, paste the code into "Enter room code" and click
    "Join" — the Worker's `/watch-together/join` should return a custom
    token, both sides should exchange it for a Firebase ID token, and
    status should change to "Connected — watching together" on both
    sides.
13. Play/pause/seek on one side — the other side should follow within
    about a second (direct-to-Firebase sync, not routed through the
    Worker).
14. Navigate to a different video on one side — the other side should
    follow to the same video.
15. Close the second browser's tab (or click "Leave Room" there) — the
    first side's status should change to "Partner left — waiting again"
    within about a minute.
16. Try joining a room that's already full (a third participant) — should
    see "Room is full."
17. Try joining a nonexistent code — should see "Room not found. Check
    the code and try again."
18. Turn off your network momentarily while creating or joined to a room —
    should see "Couldn't connect. Check your connection and try again,"
    while Auto-Playback and Zen Mode keep working unaffected.
19. Click "Leave Room" — Watch Together returns to its idle state (Create
    Room / Join Room controls).
20. **Token refresh (proactive):** stay connected in a room for the
    scheduled refresh window (~50 minutes for a ~60-minute token, or
    temporarily shorten `TOKEN_REFRESH_BUFFER_SECONDS` in
    `watch-together.js` for a faster manual test) — the client should
    silently call `/watch-together/refresh`, get a new custom token,
    exchange it, and reconnect the EventSource without dropping "Connected"
    status or requiring the user to do anything.
21. **Token refresh (reactive):** put the machine to sleep for over an
    hour while connected (or otherwise force the current ID token to
    expire), then wake it — a 401 from the next heartbeat/state
    write/stream reconnect should trigger an immediate refresh and the
    room should recover to "Connected" without the user re-joining.
22. **Rate limiting:** trigger the Worker's rate limit (repeatedly click
    Create or Join beyond its threshold) — the popup should show "Too many
    attempts — try again in N minutes," with N derived from the Worker's
    `retryAfterSeconds`.
23. **Kill switch:** with the Worker's kill switch turned on (`disabled:
    true` from `/watch-together/status`), open the popup — the Watch
    Together section should stay visible but show "Watch Together is
    temporarily unavailable" instead of the Create/Join controls. Turn the
    kill switch back off and reopen the popup — normal controls should
    return.
24. **Invalid input messaging:** try joining with a malformed room code
    (wrong length/characters) and try creating a room from a non-`/watch`
    YouTube page (e.g. the homepage) — should see "That room code doesn't
    look right..." and "This doesn't look like a YouTube video page..."
    respectively, without ever calling the Worker.
25. **Deep link, no existing room:** open
    `https://www.youtube.com/watch?v=<id>&wtRoom=<code>` for a real room in
    a tab with Watch Together idle — it should auto-join that room
    (calling `/watch-together/join`) with no confirmation needed, and the
    `wtRoom` param should disappear from the address bar afterward.
26. **Deep link, conflicting room:** while already connected to room A,
    open a `...&wtRoom=<B>` link for a different room B in the same tab —
    it should NOT switch automatically; opening the popup should show an
    inline banner ("You're in room A — join room B instead?") with "Join
    new room" / "Dismiss" actions. Confirming should leave room A and join
    room B; dismissing should leave the tab in room A untouched.
27. **Deep-link share button:** while connected or waiting in a room,
    click "Copy invite link" — the clipboard should contain
    `https://www.youtube.com/watch?v={videoId}&wtRoom={roomCode}` for the
    active tab's video and room.
