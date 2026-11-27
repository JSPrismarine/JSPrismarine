# @jsprismarine/client

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/client)](https://www.npmjs.com/package/@jsprismarine/client)

## Java Edition

`JavaClient` joins a Minecraft: Java Edition server the way a vanilla client does: the handshake,
the login, with encryption and compression when the server asks for them, the configuration, then
play. In play it answers keep-alives, confirms each teleport, acknowledges each chunk batch and
tells the server once the world around the player is loaded. It reports every packet it reads
through its `packet` event.

```typescript
import { JavaClient } from '@jsprismarine/client';

const { status } = await JavaClient.status('127.0.0.1', 25565);

const client = new JavaClient({ host: '127.0.0.1', username: 'Steve' });
client.on('chat', (message) => console.log(message));
await client.connect();
client.chat('Hello');
client.move({ x: 10, z: 4 });
```

A server in online mode needs `joinSession`, which is given the server hash to post to Mojang's
session server with the player's access token. Without it, the client joins offline servers only.
