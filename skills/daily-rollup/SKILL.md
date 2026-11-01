---
name: daily-rollup
version: 1.0.0
owner: kar
callers: [kar]
description: Kar's daily rollup of the shared feed for AGENT_FEED.md - NEEDS SIMON first, then what was flagged, then each bot's lines.
---
# daily-rollup

**What it does.** It rolls one day of the team's shared feed up for Simon. NEEDS SIMON comes first: every item still
waiting for him, each with the auditor's verdict. Then come the lines that were flagged, then each bot's lines in roster
order. With `--write` it puts the rollup above the first section of AGENT_FEED.md and replaces only an earlier rollup of
the same day. Grok Bot's syncs below it stay as they were.

**How to call it.**

    node skills/daily-rollup/scripts/daily-rollup.mjs [--date YYYY-MM-DD] [--write] [--push]

**It never** changes a feed line or another section of AGENT_FEED.md.

**Receipt.** `receipt.json` holds the rollup it printed for a scratch feed.
