---
'@jsprismarine/script-host': patch
---

A pack's `console` call with nothing to print, such as a bare `console.error()`, now logs the pack's name and the script stack it came from instead of a line that reads only `[Scripting]`.
