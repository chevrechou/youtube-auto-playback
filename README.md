# YouTube Auto-Playback

Keeps YouTube videos playing automatically: resumes paused videos, loops
the video when it ends, and dismisses "Continue watching?" prompts. Also
offers Zen Mode, which hides comments, recommendations, and end-screen
suggestions on watch pages, and Watch Together, which syncs playback with
someone else in real time. Click the toolbar icon to open a popup with
all three controls (badge shows Auto-Playback's ON/OFF state).

## Install (unpacked)

1. Copy `config.example.js` to a new file named `config.js` in this
   folder. **This step is required even if you don't plan to use Watch
   Together** — `manifest.json` references `config.js` directly, and
   Chrome refuses to load the extension at all if a listed file is
   missing. The placeholder value is fine for Auto-Playback and Zen Mode;
   only Watch Together needs a real URL in it (see Firebase setup below).
2. Open `chrome://extensions`.
3. Enable "Developer mode" (top-right toggle).
4. Click "Load unpacked".
5. Select this folder (`youtube-auto-playback`).

## Firebase setup (required for Watch Together only)

Watch Together syncs playback through a free Firebase Realtime Database.

1. Go to the [Firebase console](https://console.firebase.google.com/),
   create a project (free tier is enough), and add a **Realtime Database**
   to it (not Firestore — the older Realtime Database product).
2. Copy the database's URL, shown in the console (looks like
   `https://your-project-default-rtdb.firebaseio.com`).
3. In your local `config.js` (from step 1 above — this file is
   gitignored, so your URL stays local and is never committed), set
   `FIREBASE_DATABASE_URL` to that URL.
4. In the Realtime Database's **Rules** tab, set rules that only allow
   reading/writing a specific known room path, and never allow listing
   the top-level `rooms` collection — for example:
   ```json
   {
     "rules": {
       "rooms": {
         "$roomCode": {
           ".read": true,
           ".write": true
         }
       }
     }
   }
   ```
   This intentionally has no listing rule for `rooms` itself, so codes
   can't be discovered by scanning.
5. Reload the extension at `chrome://extensions` after saving `config.js`.

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
11. Click "Create Room" in Watch Together — a 6-character code appears
    with a "Waiting for someone to join…" status. Click "Copy" — the code
    should be copied to your clipboard.
12. In a second browser (or another Chrome profile) with the same
    extension and `config.js` installed, paste the code into "Enter room
    code" and click "Join" — status should change to "Connected —
    watching together" on both sides.
13. Play/pause/seek on one side — the other side should follow within
    about a second.
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
