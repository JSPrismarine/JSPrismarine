---
'@jsprismarine/prismarine': patch
---

Add the `JSP_DEBUG_DROP_PACKETS` debugging aid: a comma-separated list of packet class names the server withholds from clients, logging a warning for each, so a join that fails without a `Disconnect` or `PacketViolationWarning` can be bisected one packet type at a time.
