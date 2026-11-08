---
'@jsprismarine/prismarine': patch
---

Generating terrain no longer stalls the tick loop. Each terrain chunk hashed the pipeline's whole dimension and noise settings to build its cache key on the main thread; those inputs are now written once per pipeline, and the key stays identical so existing caches still hit. The cache also stopped listing and statting every record on each write. Per-tick bookkeeping got cheaper too: lighting and portal checks skip work when nothing changed, random-tick section lists skip their revision sum when no block was written, and entities without status effects skip that pass. In a CPU profile of a fresh world with eight walking bots, main-thread busy time over a 45 second window fell from about 41 seconds to about 12 seconds.
