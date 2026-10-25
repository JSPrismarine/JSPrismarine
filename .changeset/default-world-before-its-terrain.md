---
'@jsprismarine/prismarine': patch
---

Answer a command typed while the start region is still generating.

`WorldManager` named the default world after `World.enable` resolved, and enabling a world
generates its start region, so at `preload-radius: 24` there were minutes in which
`getDefaultWorld()` answered `undefined` while its type said `World`. The console reads commands
for that whole window, and every command path asks for the default world, if only for the
`sendCommandFeedback` game rule, so anything typed came back as `TypeError: Cannot read properties
of undefined (reading 'getGameRuleManager')`.

The world is named as the default when it is built, before it is enabled. Nothing about it is
missing at that point except its terrain: it has its name, its provider and its game rules, which
is what its callers ask it for. `WorldManager.loadWorld` keeps its signature and its behavior.
