---
'@jsprismarine/prismarine': patch
'@jsprismarine/script-host': patch
'@jsprismarine/script-types': patch
---

`@jsprismarine/server` has a `config` member: `config.value` is the parsed JSON of the pack's `addons/<name>.config.json`, beside its folder, or `undefined` while there is no file; `config.write(value)` rewrites it; and `config.afterEvents.change` fires on the flush after the file changes on disk. The server reads, writes and watches the file, and a file that fails to parse keeps the last value and is logged once. For code that embeds the script host, `WorldScripts` and `LevelScriptsOptions` take an `addonConfig` store, and the module leaves `config` out without one. `@jsprismarine/script-types` declares the member with its `AddonConfigEvents`, `AddonConfigChangeSignal` and `AddonConfigChangeEvent` types.
