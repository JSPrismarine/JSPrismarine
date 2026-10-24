---
'@jsprismarine/prismarine': patch
---

Add two debugging aids for a join that fails without a `Disconnect` or `PacketViolationWarning`: `JSP_DEBUG_DROP_PACKETS` names clientbound packet classes the server withholds, and `JSP_DEBUG_DUMP_PACKETS` names packets whose encoded bytes are written to files under `JSP_DEBUG_DUMP_DIR`. Each withheld or dumped packet logs a warning.
