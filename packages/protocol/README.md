# @jsprismarine/protocol

Bedrock packet classes, structures, wire layouts, version gates, and payload builders live here.
The package owns protocol encoding; a server supplies game registries and captured data through a
`ProtocolContext` rather than making the protocol package load server data itself.

## Supply per-connection data

`ProtocolContext` carries the negotiated protocol version plus the item, block, actor, biome, and
jigsaw data that a packet may need. The data stays with the codec that negotiated the connection:

```ts
import { ItemRegistryPacket, NetworkBinaryStream } from '@jsprismarine/protocol';
import type { ProtocolContext } from '@jsprismarine/protocol';

const context: ProtocolContext = {
    protocolVersion: 2225
};

const packet = new ItemRegistryPacket();
packet.serialize(new NetworkBinaryStream(), context);
void packet;
```

The server builds this context from its supported-version captures and current registries. A
packet may still receive explicit payload data when the server has generated custom content.

## Build payloads from registries

The `payload` subpath translates item, block, creative, and recipe registries into protocol packet
payloads. The functions accept those registries as arguments, so the protocol package can encode
them without importing a server instance:

```ts
import {
    buildBlockProperties,
    buildCraftingData,
    buildCreativeContent,
    buildItemRegistry
} from '@jsprismarine/protocol/payload';

const { properties } = buildBlockProperties([]);
const { entries } = buildItemRegistry([]);
const creative = buildCreativeContent(itemIdsOf(entries), { groups: [], entries: [] });
const crafting = buildCraftingData([]);
void [properties, creative, crafting];
```

For payload types, NBT helpers, and block palette checks, import from
`@jsprismarine/protocol/payload`. Packet classes and structures are exported from the package
root and from their individual module subpaths.
