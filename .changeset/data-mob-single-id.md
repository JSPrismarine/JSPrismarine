---
"@jsprismarine/prismarine": patch
---

Give each data-driven mob one runtime id. Its client-facing body used to draw a second id after the runtime drew the first, so the wire, the world's entity map and the runtime named the same mob by two numbers bridged by a lookup table. The body now carries the runtime's id, and `Entity` and `GenericEntity` take an optional `runtimeId` for a body whose id was drawn elsewhere.
