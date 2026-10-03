# @jsprismarine/client-auth

The login identity a Minecraft: Bedrock Edition client presents: the JWT chain, the client
data blob, and the key both are signed with.

It is a package of its own so that the bot harness and the headless build never pull Xbox
Live in. A provider is chosen at the edge of the application; nothing in the client core
imports one.

```typescript
import { OfflineAuthProvider } from '@jsprismarine/client-auth';

const auth = new OfflineAuthProvider({ displayName: 'Steve' });
const credentials = await auth.createLoginCredentials({
    serverAddress: '127.0.0.1:19132',
    protocolVersion: 748
});
```

`OfflineAuthProvider` signs a single self-signed chain link, which is what the real client
sends when it is not signed in. A server in online mode refuses it - there is no XUID to
check - and a server with `online-mode` off accepts it.

The default skin is generated, not shipped: flat colour blocks laid out over the regions the
classic humanoid geometry samples. Mojang's textures cannot be redistributed, and a client
that refused to log in without one would be useless.
