---
"@jsprismarine/prismarine": patch
---

Report a saved component state value that is not a record, such as an array, when an entity is restored. The record reader used to drop it, so the component started from its initial state with nothing in the log; the restore now sees it, skips it and says so, as it already did for a record of the wrong shape.
