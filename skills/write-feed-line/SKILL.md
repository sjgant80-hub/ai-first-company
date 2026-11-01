---
name: write-feed-line
version: 1.0.0
owner: kar
callers: [kar, builder, money-time, reach, scout, client-lead, card-keeper, auditor]
description: Add one line to the team's shared feed through the writer, which removes secrets, flags a done with no receipt and signs the line with your key.
---
# write-feed-line

**What it does.** Adds one line for one action to the team's shared feed (`.estate/feed.jsonl` in the team's shared
repo). The writer removes keys, tokens, emails and card numbers before anything is stored. It flags a "done" that has no
receipt link, and makes every post or listing line wait for Simon. It signs the line with your key when this machine
holds it, and it never changes an earlier line.

**How to call it.**

    node skills/write-feed-line/scripts/write-feed-line.mjs --agent <you> --kind <kind> --what "…" --link "<receipt>"
      [--needs-owner] [--to <bot>] [--receipt-file data/x-run.json] [--push]

Point `KAR_CONTINUITY` at your clone of the shared repo, or keep it in `~/.team-feed/config.json`.

**It never** posts, sends, pays or approves anything. A line is a record, not an act.

**Receipt.** `receipt.json` holds what it printed for a sample line written to a scratch feed.
