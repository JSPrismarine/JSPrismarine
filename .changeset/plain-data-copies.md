---
"@jsprismarine/prismarine": patch
---

`plainOf` copies a `Buffer` instead of returning a view of its memory, so a later write to the buffer no longer changes a value the change log recorded, and it keeps a `__proto__` key as an own data property instead of passing it to the prototype setter.
