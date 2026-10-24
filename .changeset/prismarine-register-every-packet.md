---
'@jsprismarine/prismarine': patch
---

Register the fifty packets and three handlers that had implementations but were missing from `Packets.ts` and `Handlers.ts`, so the server no longer drops them as unimplemented. A test now checks that every packet and handler file is exported, that ids are distinct and match `Identifiers`, and that `Identifiers` matches `@jsprismarine/protocol`.
