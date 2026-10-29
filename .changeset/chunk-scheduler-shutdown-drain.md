---
"@jsprismarine/prismarine": patch
---

Drain in-flight chunk deliveries and close the per-dimension entity runtimes during server shutdown, so a chunk still generating cannot land in a world mid-teardown and the runtimes' live bodies are released.
