---
name: audit-feed
version: 1.0.0
owner: auditor
callers: [auditor]
description: The auditor's pass over the shared feed - every line that needs a verdict gets PASS, FLAG or FAIL with evidence, signed with the auditor's key.
---
# audit-feed

**What it does.** It reads the team's shared feed and judges every line that needs a verdict and has none yet. It
re-hashes each receipt at its pinned commit and checks that the seal came before the code. With `--rerun` it also
re-runs the receipt's own check. It puts every tool a bot used through that bot's fence and reads the words of anything
going out. On posts and listings it asks the local model for extra flags, which can never turn into a PASS. With
`--write` it adds one verdict line per judged line, signed with the auditor's key.

**How to call it.**

    node skills/audit-feed/scripts/audit-feed.mjs [--rerun] [--write] [--push]

**It never** builds, fixes, posts or approves. The only file it writes is the feed.

**Receipt.** `receipt.json` holds what it printed for a scratch feed holding one forbidden act.
