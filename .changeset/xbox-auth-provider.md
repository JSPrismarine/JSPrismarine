---
'@jsprismarine/auth': patch
'@jsprismarine/prismarine': minor
'@jsprismarine/client': patch
'@jsprismarine/nethernet': patch
---

`@jsprismarine/auth` covers both ends of a Bedrock login. `XboxAuthProvider` signs in to Xbox Live through prismarine-auth, an optional peer dependency loaded only when a provider signs in, and presents the chain and multiplayer token Minecraft services issue for its key. `createAuthProvider` builds a provider by name, and `KeyedAuthProvider` is the base both providers share. A provider's `getMultiplayerToken()` returns its token, and `@jsprismarine/client` signs its NetherNet offer with it, as a signed-in game client does. The server's login verification moved into the package as `verifyLogin`, exported from `@jsprismarine/auth/server`, beside the values both ends agree on in `@jsprismarine/auth/protocol`.

Every JWT and JWS is now signed, verified and decoded by `jose` rather than by hand or through fast-jwt, which no package depends on any more. `verifyLogin` fetches the issuer's keys through `jose`'s remote key set, and allows a minute of clock drift on a token's expiry as well as its start.

Breaking: `@jsprismarine/prismarine/network/LoginVerifier` is removed; import `verifyLogin`, `LoginRefused`, `MojangKeys` and `useLoginKeys` from `@jsprismarine/auth/server`, and `TOKEN_ISSUER` from `@jsprismarine/auth/protocol`. `MojangKeys` takes a `fetch` implementation instead of a key set loader and a clock. `SessionEncryption.begin` returns a promise.
