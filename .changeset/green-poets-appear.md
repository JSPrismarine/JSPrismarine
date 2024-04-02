---
"@jsprismarine/prismarine": patch
---

- Remove `EvalCommand`.
  - It was potentially if not already a security risk.
  - We could potentially add something similar running under a virtual environment in the future, but not a priority at the moment.
- Fix and substantially improve stdin/tty.
  - There are still ways to go, but it's a lot better now.
