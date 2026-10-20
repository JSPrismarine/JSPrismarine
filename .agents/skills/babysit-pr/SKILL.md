---
name: babysit-pr
description: Monitor a pull request through review and CI. Use when the user asks to monitor, watch, or babysit a PR.
---

The repository has various AI review bots. They're helpful, even if
they are not always right.

If your harness offers tools to monitor a PR, use them so you can respond when
comments arrive. Otherwise, poll the PR for new comments and checks.

Only act on checks and comments newer than the latest push. Verify every bot
finding against the source before changing code. Fix real findings and CI
failures, distinguish repository failures from infrastructure flakes, and reply
with a written reason when dismissing false positives.

Keep an eye on changes to `master` and rebase when needed. If an overlapping PR
makes this one obsolete, stop monitoring, report it to the user, and ask before
closing the PR unless closure was explicitly authorized.

If a review bot leaves feedback you believe is not worth addressing, reply with
a written reason and resolve the comment. Use the `leaving-pr-comments` skill
for every comment posted on user's behalf.

Do not let review feedback expand the PR beyond the user's original goal.
Address real shortcomings, but avoid scope creep.

If nothing has changed, stay quiet rather than posting filler comments. Stop
when the review bots and required checks are green on the latest commit. Merge
only when the user explicitly requested it; otherwise report that the PR is
ready.
