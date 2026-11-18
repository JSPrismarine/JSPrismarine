---
'@jsprismarine/prismarine': minor
'@jsprismarine/script-host': minor
---

Behavior pack scripts can now declare the beta Script API versions the pinned Bedrock Dedicated Server ships, such as `@minecraft/server` 2.12.0-beta, `@minecraft/server-ui` 2.4.0-beta and the 1.0.0-beta of `server-gametest`, `server-admin`, `server-net` and `debug-utilities`. A pack that declares one needs the Beta APIs experiment, which a `worlds.<name>` entry turns on with `"experiments": ["gametest"]`. The level writes the experiment into `level.dat` and sends it to joining clients, and a world whose `level.dat` already has it on, such as one from BDS, keeps it. Without the experiment the pack does not load, and the content log gives BDS's message.

Version resolution follows BDS: a pack gets a beta only when it is the one beta the server ships, and the version `beta` names that one. Any other version, beta or stable, such as `2.13.0-beta` or `2.12.0`, is refused with BDS's "requested invalid version" message, where the script host logged the unknown-module message before.

`world.beforeEvents.chatSend` now runs as a guard on a player's chat, before the `chat` event, and a script can cancel the line. `system.beforeEvents.watchdogTerminate` runs before the watchdog shuts the server down for a hang or a stack overflow, and a cancel keeps the server running.

Breaking for code that embeds the script host: `resolveDependency` takes the pack as `{ name, version }`, `ScriptWorld` needs `guardChat`, and `LevelScripts`' `sources` need `chat`, which takes the server's `ChatManager`.
