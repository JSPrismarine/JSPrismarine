---
'@jsprismarine/errors': patch
'@jsprismarine/prismarine': patch
'@jsprismarine/script-host': patch
---

Behavior packs that declare `@minecraft/server-net` can send HTTP requests with `http.get` and `http.request`, build them with `HttpRequest` and `HttpHeader`, read the `HttpResponse`, and cancel them with `http.cancelAll`, as Bedrock Dedicated Server does: the same default headers, no redirects followed, `MalformedUriError` for a scheme other than `http` or `https`, and `InternalHttpRequestError` with the system's error code for a request that fails. A request runs off the tick, and its result enters the world in a later tick's input step. `Server.getScriptHttp()` records each admitted result and replays them, so a replay settles the same requests in the same ticks without the network. Packs that declare `@minecraft/server-admin` read `variables` and `secrets` from their `config/<script module uuid>/variables.json` and `secrets.json`, with each secret as an opaque `SecretString` that only a request header sends, and can move a player to another server with `transferPlayer`. As on Bedrock Dedicated Server, a pack needs the Beta APIs experiment and a `permissions.json` that allows `@minecraft/server-net`, which the default one does not.
