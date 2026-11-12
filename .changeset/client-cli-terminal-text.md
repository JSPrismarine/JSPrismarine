---
'@jsprismarine/client': patch
---

The client CLI removes terminal escape sequences and control characters from text a server sent before printing it: chat lines and their sender, the ping MOTD and version fields, the joined player's name, and failure reasons in a fleet report. A server could otherwise move the cursor, clear or retitle the terminal, or overwrite earlier output.
