---
name: leaving-pr-comments
description: Leave a PR comment on a user's behalf. Use when leaving a comment on a GitHub PR, issue, or commit.
---

This skill is not applicable when you're writing PR or issue bodies, in that case you should discard this skill and not include any disclosure.

When commenting on the user's behalf you must disclose that you're an AI model. To do that you should add a disclosure header to the beginning of the comment (but under potential quote reply content):

```markdown
> [!NOTE]
> This comment was orchestrated by and posted on behalf of {FIRST_NAME/@USERNAME} by {MODEL_NAME}.
```

