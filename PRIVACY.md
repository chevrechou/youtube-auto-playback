# Privacy Policy — YouTube Auto-Playback

Last updated: 2026-07-13

This extension does not collect, sell, or share any personal information. There is no analytics, tracking, or advertising SDK of any kind in this extension.

## What the extension stores locally

Your Auto-Playback and Zen Mode on/off preferences are stored using Chrome's built-in `chrome.storage.sync` API. This data stays within your own Google account's Chrome sync and is never sent to us or any third party.

## Watch Together (optional feature)

Watch Together is an opt-in feature for syncing YouTube playback with another person in real time. It only activates when you click "Create Room" or "Join Room." If you never use it, no data described in this section is created.

When you use Watch Together:

- **Room data**: the video ID currently playing, its playback position, and play/pause state are written to a Firebase Realtime Database, scoped to a randomly generated 6-character room code. This data is only readable by clients holding a matching authentication token for that room (i.e., people who have the room code).
- **Client identifier**: a randomly generated, anonymous session ID (not tied to your Google account, name, or email) is used to identify your browser tab within a room, so the other participant can tell you're present.
- **IP address**: your IP address is read transiently by our Cloudflare Worker backend solely to enforce rate limits (preventing abuse of room creation). It is stored temporarily in Cloudflare KV as part of a rate-limit counter and automatically expires within about an hour. It is not logged permanently or linked to any other data.
- **Room data lifecycle**: rooms and their data are automatically deleted after 24 hours of inactivity by an automated cleanup job.

No account creation, email address, or personal profile is required or collected to use Watch Together.

## Permissions this extension requests, and why

- **`storage`**: to save your Auto-Playback/Zen Mode toggle state and Watch Together session state locally.
- **Host permission for `youtube.com`**: to detect and control the video player (auto-resume, loop, dismiss prompts, Zen Mode, Watch Together sync).
- **Host permissions for our Firebase and Cloudflare Worker backend, and Google's Identity Toolkit/Secure Token services**: required only for the Watch Together feature, to sync playback state and authenticate room sessions.

## Third-party services used

- **Firebase Realtime Database** (Google) — stores Watch Together room state as described above.
- **Cloudflare Workers** — hosts the backend that creates/validates Watch Together rooms and enforces rate limiting.

Both are used solely to operate the Watch Together feature and are subject to their own respective privacy practices as data processors, not as recipients of your personal data (since none is collected).

## Changes to this policy

If this policy changes, the "Last updated" date above will be updated and the new version published at this same URL.

## Contact

Questions about this policy can be filed as an issue on the project's GitHub repository.
