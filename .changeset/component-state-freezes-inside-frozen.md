---
"@jsprismarine/entities": patch
---

Freeze the inside of a component state value that arrives already frozen. A component that wrote `Object.freeze({ seen: [] })` could still push to `seen`, changing stored state without a reported write.
