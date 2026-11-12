---
'@jsprismarine/logger': patch
---

The logger makes every message terminal-safe before a transport sees it. Escape sequences, carriage returns and other control characters are removed, line feeds stay, and each further line of a console record is indented so it cannot pass for a record of its own. A message often carries text a client chose, such as a player name from an unverified login, a book title or a command, and those used to reach the console and the log file as they were. `terminalText` is exported for code that prints untrusted text itself.
