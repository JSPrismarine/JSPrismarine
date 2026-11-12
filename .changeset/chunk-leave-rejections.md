---
"@jsprismarine/prismarine": patch
---

Log a chunk whose removal fails during a batch of unloads and carry on with the rest. The failure used to wait unhandled until every later chunk in the batch had saved, which Node could report as an unhandled rejection first.
