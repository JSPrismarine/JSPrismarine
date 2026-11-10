# @jsprismarine/nethernet

## 0.20.0

### Patch Changes

- [#2944](https://github.com/JSPrismarine/JSPrismarine/pull/2944) [`e498e81`](https://github.com/JSPrismarine/JSPrismarine/commit/e498e81b74d4ca6ee2ea27dedc773c6b2fd37ab0) Thanks [@filiphsps](https://github.com/filiphsps)! - New package `@jsprismarine/nethernet` holds the NetherNet pieces a server and a client share: HTTP signaling, the signed `a=identity` on SDP answers, the LAN advertisement codec and the ES384 JSON Web Signatures Bedrock uses. `@jsprismarine/prismarine` uses it for its NetherNet transport and its encryption handshake.

- [#2944](https://github.com/JSPrismarine/JSPrismarine/pull/2944) [`2f505cd`](https://github.com/JSPrismarine/JSPrismarine/commit/2f505cdb9140773af493c3f73890473556bed003) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/auth` covers both ends of a Bedrock login. `XboxAuthProvider` signs in to Xbox Live through prismarine-auth, an optional peer dependency loaded only when a provider signs in, and presents the chain and multiplayer token Minecraft services issue for its key. `createAuthProvider` builds a provider by name, and `KeyedAuthProvider` is the base both providers share. A provider's `getMultiplayerToken()` returns its token, and `@jsprismarine/client` signs its NetherNet offer with it, as a signed-in game client does. The server's login verification moved into the package as `verifyLogin`, exported from `@jsprismarine/auth/server`, beside the values both ends agree on in `@jsprismarine/auth/protocol`.
  
  Every JWT and JWS is now signed, verified and decoded by `jose` rather than by hand or through fast-jwt, which no package depends on any more. `verifyLogin` fetches the issuer's keys through `jose`'s remote key set, and allows a minute of clock drift on a token's expiry as well as its start.
  
  Breaking: `@jsprismarine/prismarine/network/LoginVerifier` is removed; import `verifyLogin`, `LoginRefused`, `MojangKeys` and `useLoginKeys` from `@jsprismarine/auth/server`, and `TOKEN_ISSUER` from `@jsprismarine/auth/protocol`. `MojangKeys` takes a `fetch` implementation instead of a key set loader and a clock. `SessionEncryption.begin` returns a promise.
- Updated dependencies [[`f030c63`](https://github.com/JSPrismarine/JSPrismarine/commit/f030c63e5c6269288d8dc576bddde160eda3cc74)]:
  - @jsprismarine/binaryutils@0.20.0
  - @jsprismarine/logger@0.20.0
