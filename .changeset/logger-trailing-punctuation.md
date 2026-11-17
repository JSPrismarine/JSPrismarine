---
'@jsprismarine/logger': patch
---

The logger no longer adds a period to a message that already ends in a colon, semicolon, comma or ellipsis, or in whitespace. A colon that introduces the lines after it, as in the startup banner's list of protocol versions, now stays as written. Format codes at the end of a message are ignored when checking.
