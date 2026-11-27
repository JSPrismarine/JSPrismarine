import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { serverboundDataStorePacket } from '../wire/definitions/serverboundDataStore';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { ServerboundDataStore } from '../wire/definitions/serverboundDataStore';

export type { ServerboundDataStore } from '../wire/definitions/serverboundDataStore';

/**
 * One data store update from the client, for the server to apply to its store.
 *
 * Protocol 2193 and 2225 layout (the same at both): the payload is a single `Update`, a {@link DataStoreUpdate}:
 * `Data Store Name`, `Property` and `Path` as strings, the `Data` one-of (a varuint32
 * selector, then a little-endian double, one boolean byte, or a string), then
 * `Property Update Count` and `Path Update Count` as little-endian uint32. Strings are a
 * varuint32 byte length followed by UTF-8.
 *
 * Mojang split this packet and `ClientboundDataStorePacket` out of `DataStoreSyncPacket`
 * "for future use in UI". A client sends it for a click or an input on a data-driven screen,
 * such as a `@minecraft/server-ui` `CustomForm`, as a write to one path of the screen's property.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/serverbound-data-store-packet/
 */
export default class ServerboundDataStorePacket extends NetworkPacket<ServerboundDataStore> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'ServerboundDataStorePacket';
    }

    public get id(): number {
        return PacketIdentifier.SERVERBOUND_DATA_STORE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ServerboundDataStore): void {
        layoutAt(serverboundDataStorePacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ServerboundDataStore {
        return layoutAt(serverboundDataStorePacket, this.codecProtocol).decode(stream);
    }
}
