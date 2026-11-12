---
"@jsprismarine/prismarine": patch
---

Bound the inputs one connection may hold for the input step to `INPUT_ADMISSION_BUDGET_PER_TICK`. The server drops an input-lane packet that a connection sends past the bound and logs a warning when the drops start and a count when they stop. The client stays connected, as Bedrock Dedicated Server's packet rate limiter rejects packets over its limits without closing the connection.
