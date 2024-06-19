---
'@jsprismarine/prismarine': patch
---

As a parity change with Java and BDS the console will no longer require
you to type a `/` (slash) before running a command. As a consequence of
this change the chat functionality of the console has been removed, to
send chat messages now you will need to use one of the many commands
like `/say`, `/me`, `/tellraw`, and more.

All on `enable` and `disable` hooks have now been documented with JSDoc
and also given proper return types.
