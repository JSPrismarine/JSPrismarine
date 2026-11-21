---
'@jsprismarine/script-host': patch
---

The script debugger delivers its last message before it closes a connection, such as the line saying a passcode was wrong. It used to destroy the socket with the extension's own frames still unread, and the reset that sent could make the extension drop that line.
