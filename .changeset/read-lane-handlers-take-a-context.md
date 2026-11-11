---
"@jsprismarine/prismarine": minor
---

Move the read-lane packet handlers to the narrow context. `AnvilDamageHandler`, `BookEditHandler`, `BossEventHandler`, `LabTableHandler`, `LecternUpdateHandler`, `PlayerToggleCrafterSlotRequestHandler`, `StructureBlockUpdateHandler` and `StructureTemplateDataRequestHandler` implement `ReadLaneHandler` and take a `SessionContext` in place of the `Server` and the session, so a plugin that calls their `handle` directly passes one. Each one does what it did before and stays in the read lane.
