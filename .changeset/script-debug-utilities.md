---
'@jsprismarine/errors': patch
'@jsprismarine/prismarine': patch
'@jsprismarine/script-host': patch
---

Behavior packs that declare `@minecraft/debug-utilities` can draw debug shapes. `DebugArrow`, `DebugBox`, `DebugCircle`, `DebugCone`, `DebugCylinder`, `DebugEllipsoid`, `DebugLine`, `DebugPyramid`, `DebugSphere` and `DebugText` keep what a script sets with Bedrock Dedicated Server's defaults, and `debugDrawer.addShape`, `removeShape` and `removeAll` and a shape's `remove` send them to the level's players as `PrimitiveShapesPacket`s, again only when a script changes one, and all of them to a player who joins. A drawn shape's `timeLeft` loses 0.05 seconds each tick, where BDS takes off each frame's time, so a replay counts it the same. `disableWatchdogTimingWarnings` does nothing, since the watchdog never warns about time.

A setter's conversion error now names the `Function return value` and an object the host did not make has `no native handle`, a float property's bounds error gives the float range, and a variant's types are listed primitives first, then classes and interfaces, then arrays, all as BDS words them. `ScriptWorld` gains an optional `drawDebugShapes`, and `ScriptApiContext` a `setState`. The error catalog's `InterfacePropertyMissing` takes the `target` it names, and gains `InterfacePropertyNotFinite`.
