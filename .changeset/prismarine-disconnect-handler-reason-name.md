---
'@jsprismarine/prismarine': patch
---

When a client sends `DisconnectPacket`, the log line now names the `DisconnectReason` next to its number, for example `reason 3 (UNRECOVERABLE_ERROR)`. A number the enum does not list is logged bare.
