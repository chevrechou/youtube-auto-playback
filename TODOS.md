# TODOS

## Zen Mode: warn when selectors stop matching

**What:** Add a console warning if Zen Mode's CSS selectors don't match any
elements on the page (detects when YouTube's DOM structure has changed).

**Why:** Zen Mode hides elements via injected CSS keyed to specific
selectors (`#comments`, `#secondary`, etc.). If YouTube renames or
restructures these elements, Zen Mode silently stops working — no error,
it just quietly does nothing. A user would think the extension broke
rather than realizing a selector needs updating.

**Pros:** Turns a silent failure into something debuggable via the
console; cheap to add once the selector list exists.

**Cons:** Adds a small amount of runtime DOM querying (a `querySelector`
check) that the CSS-only approach was specifically chosen to avoid in the
Zen Mode plan; only useful to someone who thinks to check the console.

**Context:** Surfaced during the Zen Mode eng review (2026-07-12) as a
flagged production failure scenario. Not urgent — YouTube's core DOM
(`#comments`, `#secondary`) has been fairly stable — but worth having on
record before it's forgotten.

**Depends on:** `lib/zen-mode.js` and its selector list existing first
(part of the Zen Mode plan).

## Watch Together: same user joining from multiple tabs

**What:** Handle the case where a user has multiple YouTube tabs open and
more than one tries to join the same Watch Together room.

**Why:** Each tab currently gets its own client ID, so a single person
with 2 tabs open could accidentally consume both slots in their own
2-person room, then get a confusing "room is full" error against
themselves.

**Pros:** Prevents that confusing self-lockout scenario.

**Cons:** Requires some way to recognize "these two client IDs are
actually the same browser" — not trivial, and low-frequency in practice.

**Context:** Surfaced during Watch Together's eng review (2026-07-12).
Not blocking Plan 1 — worth revisiting if it turns out to bite real
users.

**Depends on:** Watch Together Plan 1 shipping first.
