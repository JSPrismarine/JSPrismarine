---
"@jsprismarine/prismarine": patch
---

A damage before-hook that removes itself while it runs no longer makes the pipeline skip the hook after it, so a one-shot hook ahead of a veto can no longer let the blow through.
