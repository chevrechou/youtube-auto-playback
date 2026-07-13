# YouTube Auto-Playback

Keeps YouTube videos playing automatically: resumes paused videos, loops
the video when it ends, and dismisses "Continue watching?" prompts. Also
offers Zen Mode, which hides comments, recommendations, and end-screen
suggestions on watch pages. Click the toolbar icon to open a popup with
both switches (badge shows Auto-Playback's ON/OFF state).

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable "Developer mode" (top-right toggle).
3. Click "Load unpacked".
4. Select this folder (`youtube-auto-playback`).

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
