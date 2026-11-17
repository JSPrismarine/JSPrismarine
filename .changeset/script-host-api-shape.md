---
'@jsprismarine/script-host': patch
---

Add the Script API's shape, generated from the `metadata/script_modules` files of the pinned `bedrock-samples`: every stable version of `@minecraft/server`, `@minecraft/server-ui`, `@minecraft/server-graphics` and `@minecraft/common`, with their classes, members, argument checks, enums, constants, error classes and privileges. `resolveDependency` serves a pack the newest stable minor version of the major version it declares, as Bedrock Dedicated Server does, or returns the server's message for a module it refuses. `ScriptApiContext` installs a served version into an engine, where every member checks its arguments and then runs the implementation registered with `ScriptApiImplementations.implement`, or throws `NotImplementedError`.
