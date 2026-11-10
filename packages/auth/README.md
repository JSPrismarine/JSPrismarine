# @jsprismarine/auth

The login identity of Minecraft: Bedrock Edition, for both ends of a connection. A client uses it
to present an identity: the JWT chain or multiplayer token, the client data blob, and the key both
are signed with. A server uses it to check that a login belongs to the account it names.

It is a package of its own so that a provider is chosen at the edge of an application: nothing in
the client core imports one, and Xbox Live code loads only when a provider signs in.

## Client: presenting an identity

Every provider implements `IAuthProvider`. Two ship with the package:

- `OfflineAuthProvider` signs its own identity, which is what the game client sends when it is not
  signed in. A server in online mode refuses it, since there is no XUID to check; a server with
  `online-mode` off accepts it.
- `XboxAuthProvider` signs in to Xbox Live and presents the chain and multiplayer token that
  Minecraft services issue for its key. A server in online mode admits it.

```typescript
import { OfflineAuthProvider } from '@jsprismarine/auth';

const auth = new OfflineAuthProvider({ displayName: 'Steve' });
const credentials = await auth.createLoginCredentials({
    serverAddress: '127.0.0.1:19132',
    protocolVersion: 2193
});
```

`XboxAuthProvider` signs in through [prismarine-auth](https://github.com/PrismarineJS/prismarine-auth),
an optional peer dependency. Install it beside this package to use the provider:

```sh
pnpm add @jsprismarine/auth prismarine-auth
```

The first sign-in asks for a device code. prismarine-auth caches the account, so later runs sign in
without one:

```typescript
import { XboxAuthProvider } from '@jsprismarine/auth';

const auth = new XboxAuthProvider({
    cacheDirectory: './auth-cache',
    onDeviceCode: (code) => console.log(code.message)
});
```

`getMultiplayerToken()` returns the token for a transport that presents the identity before the
login does. `@jsprismarine/client` signs its NetherNet offer with it.

To choose a provider from a setting, `createAuthProvider` builds one by name:

```typescript
import { createAuthProvider } from '@jsprismarine/auth';

const auth = createAuthProvider({ provider: 'xbox', cacheDirectory: './auth-cache' });
```

A provider of your own can extend `KeyedAuthProvider`, which holds the identity key and signs the
client data, and supply only the identity and the chain.

## Server: verifying a login

`verifyLogin` checks a login's two signatures: Minecraft services signed the multiplayer token,
which names the account and the client's key, and that key signed the client data. It fails closed
and throws `LoginRefused`, whose message is safe to show the player.

```typescript
import { LoginRefused, verifyLogin } from '@jsprismarine/auth/server';

try {
    const { xuid, displayName } = await verifyLogin(login);
} catch (error) {
    if (error instanceof LoginRefused) disconnect(error.message);
}
```

The issuer's public keys come from `MojangKeys`, fetched on demand and kept for an hour.
`useLoginKeys` replaces the source in a test.

## Entry points

- `@jsprismarine/auth` exports everything.
- `@jsprismarine/auth/client` exports the providers and the client data.
- `@jsprismarine/auth/server` exports login verification.
- `@jsprismarine/auth/protocol` exports the values both ends agree on, such as `TOKEN_ISSUER` and
  `AuthenticationType`.

## The default skin

The default skin is generated, not shipped: flat color blocks laid out over the regions the
classic humanoid geometry samples. Mojang's textures cannot be redistributed, and a client that
refused to log in without one would be useless.
