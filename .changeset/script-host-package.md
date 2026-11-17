---
'@jsprismarine/script-host': patch
---

Add `@jsprismarine/script-host`, the engine JSPrismarine will run Bedrock behavior pack scripts in: Fabrice Bellard's QuickJS with a C layer of our own, bound through `node:ffi`. An engine evaluates scripts and modules, calls synchronous host functions, stops a script at a step budget counted in interrupt handler calls, and enforces memory and stack limits. Each context has the same globals and built-in members as Bedrock Dedicated Server's QuickJS, and refuses `eval`, `Function` from a string and the regular expression syntax that BDS rejects. This release builds the library from source on Linux only.
