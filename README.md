# YouTube Auto-Playback

Keeps YouTube videos playing automatically: resumes paused videos, loops
the video when it ends, and dismisses "Continue watching?" prompts. Toggle
on/off by clicking the toolbar icon (badge shows ON/OFF).

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
4. Click the toolbar icon — badge should switch to "OFF"; pause a video
   and confirm it now stays paused.
5. Click the toolbar icon again — badge should switch back to "ON"; confirm
   auto-resume behavior returns.
