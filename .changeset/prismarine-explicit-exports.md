---
'@jsprismarine/prismarine': minor
'@jsprismarine/server': patch
---

`@jsprismarine/prismarine` exports a fixed list of entry points in place of `"./*"`, so a module that is not on the list no longer resolves from the published package. Each entry point is the module that defines what it exports, and the package has no barrel left.

The root is now `Server.ts`. `import { Server } from '@jsprismarine/prismarine'` still works, and the root exports nothing else: `Config`, `ConfigBuilder`, `Console`, `Chat`, `PlayerSession`, `BaseProvider`, the managers, the `Events`, `Handlers`, `BlockEntities` and `Seed` namespaces and the contents of every directory barrel are gone from it. Import each symbol from the module that defines it:

- `Config`: `@jsprismarine/prismarine/config/Config`
- `serverVersion` and `softwareLabel`: `@jsprismarine/prismarine/version`; `about`: `@jsprismarine/prismarine/about`
- `RemoteConsole` and `RemoteLogTransport`: `@jsprismarine/prismarine/console/RemoteConsole` and `@jsprismarine/prismarine/console/RemoteLogTransport`
- `readContentSettings` and `resolvePackStack`: `@jsprismarine/prismarine/content/settings` and `@jsprismarine/prismarine/content/packStack`
- `ServerEvents`: `@jsprismarine/prismarine/events/ServerEvents`; `Event`: `@jsprismarine/prismarine/events/Event`; each event class is the default export of its module, such as `@jsprismarine/prismarine/events/chat/ChatEvent` or `@jsprismarine/prismarine/events/player/PlayerSpawnEvent`
- `Chat`: `@jsprismarine/prismarine/chat/Chat`
- `PlayerSession`, the default export of `@jsprismarine/prismarine/network/PlayerSession`
- `InboundPacketTrace`, `OutboundPacketTrace` and the replay manifest functions: `@jsprismarine/prismarine/network/InboundPacketTrace`, `@jsprismarine/prismarine/network/OutboundPacketTrace` and `@jsprismarine/prismarine/network/ReplayManifest`
- The kernel tokens, such as `networkToken` and `chatToken`: `@jsprismarine/prismarine/modules/tokens`
- `Level`, `World` and `GeneratorFactories`: `@jsprismarine/prismarine/world/Level`, `@jsprismarine/prismarine/world/World` and `@jsprismarine/prismarine/world/GeneratorFactories`
- `DataDrivenGenerator` and `SharedTerrainTileStore`: `@jsprismarine/prismarine/world/generators/datadriven/DataDrivenGenerator` and `@jsprismarine/prismarine/world/generators/datadriven/SharedTerrainTileStore`

`@jsprismarine/prismarine/Server` is no longer an entry point; import the root. Inside the package, `world/Dimension.ts` no longer re-exports `DimensionType.ts`, `javaWorldgenData.ts` no longer re-exports `javaWorldgenSources.ts`, and `builtInGeneratorFactories` moved to `world/generators/factories/builtIn.ts`. If a program needs a module that is not an entry point, open an issue so it can be made public.

`@jsprismarine/server` loads Prismarine through these entry points.
