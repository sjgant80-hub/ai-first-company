---
name: check-draft
version: 1.0.0
owner: auditor
callers: [reach, money-time, card-keeper, kar, auditor]
description: Before a post or listing goes out - every number on its link, no MIT claim without a LICENSE, nothing on the hold list, the team's words law.
---
# check-draft

**What it does.** It reads a post or a listing before it goes out, with the same judge the feed audit uses
(`src/auditor.mjs`). It answers PASS, FLAG or FAIL, and gives the evidence for each check:

- **Words.** No earnings or savings promise, no crypto, no guarantee or superlative, no price, no in-house jargon, and no
  named partner without consent.
- **Numbers.** Every number in the draft must be on the page or file it links to. A GitHub link pinned to a commit
  (`github.com/<owner>/<repo>/blob/<commit>/<path>`) is read at that commit; a repo link reads its README. A percentage
  also counts when it is the draft's own "a of b", with both numbers on the link. A draft with numbers and no link FLAGs.
- **Licence.** "MIT" or "open source licence" FAILs when the linked repo has no LICENSE file.
- **Holds.** Some claims are true but must not be said yet. They are on the shared repo's private hold list
  (`team/holds.json`). A draft that matches one FAILs, with the hold's reason.

**How to call it.**

    node skills/check-draft/scripts/check-draft.mjs --text "the draft" --link <the receipt it cites> [--kind post|listing]

It prints the verdict as JSON. The exit code is 0 only on PASS.

**The rule for the reach bots.** Run it on every post and listing before it goes out:
- PASS: it may go out on the agreed cadence.
- FLAG or FAIL: it does not go out. Send it to Kar with the evidence.

**Link the receipt, not the live page.** The pages draw their numbers from the records as they load, so a page's HTML
does not carry them. Link the record or README pinned to a commit.

**It never** posts, lists or edits. It only reads and answers.

**Measured.** `data/draftgate-prereg.json` was sealed before the code: 6 drafts that must be held and 3 that must pass.
`data/draftgate-run.json` has the result: all 6 held, each by the check the seal named, and all 3 passed.
