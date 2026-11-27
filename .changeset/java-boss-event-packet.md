---
'@jsprismarine/protocol': patch
'@jsprismarine/errors': patch
---

Add Java Edition's `Boss Event` packet (`BossEvent` in `@jsprismarine/protocol/java/packet/play`), which adds, removes and updates a boss bar, with its operations, colors, overlays and flags. Reading an operation that Java 26.3 does not define throws `JavaBossEventOperationUnknown`.
