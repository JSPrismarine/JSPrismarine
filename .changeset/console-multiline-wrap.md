---
'@jsprismarine/console': patch
---

The console TUI now wraps long log lines by default (`w` still toggles it) and starts a new row at each newline in a message, indented under the message column. It used to paint the newline inside a single row.
