---
'@jsprismarine/prismarine': patch
'@jsprismarine/errors': patch
---

A console command typed while the server starts runs once the worlds load, where it failed with `Cannot read properties of undefined (reading 'getLevel')`. Asking for the entry world before it loads now throws `EntryWorldNotLoaded`, which names the cause.
