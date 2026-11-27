---
'@jsprismarine/prismarine': patch
'@jsprismarine/errors': patch
---

A command host verb called outside a command dispatch now throws `CommandWorkOutsideDispatch` instead of starting work nothing awaits, whose failure surfaced later as an unhandled rejection or not at all. Feedback a command sends after its dispatch has finished no longer stays queued for the life of the server.
