---
'@jsprismarine/prismarine': patch
'@jsprismarine/script-host': patch
'@jsprismarine/script-types': patch
---

Behavior pack scripts have a second JSPrismarine module, `@jsprismarine/placeholders`, loaded like `@jsprismarine/server` with `import()` inside `try`. A pack registers a namespace with `register(namespace, { keys, resolve })`, any pack renders a text with `resolve(text, player?)`, and `namespaces()` lists what is registered. A token is `{namespace:key}`; one nobody provides, or whose resolver gives `undefined` or throws, stays as written, and a resolver that throws reaches the content log once per namespace. A namespace belongs to the pack that registered it and goes when the pack's scripts stop. `jsprismarine.maxPlayers` in `@jsprismarine/server` is the server's `max-players`. `@jsprismarine/script-types` declares both modules, with the `PlaceholderProvider`, `PlaceholderRegistration` and `PlaceholderNamespace` types. For code that embeds the script host, `WorldScripts` exposes the registry as `placeholders`, so the server can register namespaces of its own, and `LevelScriptsOptions` takes `maxPlayers`.
