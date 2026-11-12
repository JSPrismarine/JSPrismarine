---
'@jsprismarine/logger': patch
---

`FileTransport` indents every line of a record after the first by four spaces, and treats a lone carriage return as a line break. A line break in text a client sent, such as a book title or a player name, used to start a new line that could pass for a record the server wrote.
