---
"@jsprismarine/prismarine": patch
---

`MobBody.actorTags` copies the bytes it is given and the bytes it returns, so changing either array in place no longer changes the body's logged state, or the change log entries that hold it, without a write.
