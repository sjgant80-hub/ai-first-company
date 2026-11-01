---
name: check-fence
version: 1.0.0
owner: kar
callers: [kar, builder, money-time, reach, scout, client-lead, card-keeper, auditor]
description: Ask before acting - may this bot use this tool now, given the auditor's PASS and Simon's signed go?
---
# check-fence

**What it does.** It answers from the roster (`data/roster.json`) whether a bot may use a tool, and on what condition.
The answer is allowed, or refused with the reason: unknown, forbidden, off-list, needs the auditor's PASS, or needs
Simon's go. Outward tools always need Simon's go, whatever a roster says.

**How to call it.**

    node skills/check-fence/scripts/check-fence.mjs <bot> <tool> [--pass] [--go]

`--pass` says the auditor's signed PASS exists for the item; `--go` says Simon's signed approval exists. The answer is
printed as JSON; the exit code is 0 when allowed and 1 when refused.

**It never** acts. It only answers.

**Receipt.** `receipt.json` holds two sample answers.
