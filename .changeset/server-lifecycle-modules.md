---
"@jsprismarine/prismarine": patch
---

Start and stop the whole server through its module kernel. The content build, the packet handlers, the commands, the worlds and the `#minecraft:load` functions are kernel modules with declared dependencies, so they start in dependency order and stop in reverse, and `modules/tokens` exports `contentToken`, `packetHandlersToken`, `commandsToken` and `worldsToken` for them. A shutdown during the start-region preload now closes the worlds and ends the boot without opening the listener.
