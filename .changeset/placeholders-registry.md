---
'@jsprismarine/prismarine': minor
'@jsprismarine/script-host': minor
'@jsprismarine/script-types': minor
---

`@jsprismarine/server` has a `placeholders` registry. A pack registers a namespace with `placeholders.register(namespace, { keys, resolve })`, any pack renders a text with `placeholders.resolve(text, player?)`, and `placeholders.namespaces` lists what is registered. A token is `{namespace:key}`; one nobody provides, or whose resolver gives `undefined` or throws, stays as written, and a resolver that throws reaches the content log once per namespace. A namespace belongs to the pack that registered it and goes when the pack's scripts stop. `jsprismarine.maxPlayers` is the server's `max-players`. `@jsprismarine/script-types` declares the member with its `PlaceholderProvider`, `PlaceholderRegistration` and `PlaceholderNamespace` types. For code that embeds the script host, `WorldScripts` exposes the registry as `placeholders`, so the server can register namespaces of its own, and `LevelScriptsOptions` takes `maxPlayers`.
