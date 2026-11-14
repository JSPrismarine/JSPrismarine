import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { serverStoreInfoPacket } from '../wire/definitions/serverStoreInfo';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { ServerStoreInfo } from '../wire/definitions/serverStoreInfo';

export type { ServerStoreInfo };

/**
 * Points the client's marketplace entry point at a server's store.
 *
 * Wire order, at protocols 2193 and 2225: `client_store_entry_point_configuration` as an optional
 * `ClientStoreEntryPointConfig`, which is a presence `bool` and then, when present, `storeId` and
 * `storeName`, both strings (a varuint32 byte length followed by UTF-8). Nothing else follows.
 * The 1.26.50 page prints the field as plain, the 1.26.60 page as optional with a changelog
 * entry "is now optional"; Mojang's note on that build calls these entries a documentation
 * correction, so the presence byte is not gated by version
 * (`docs/research/protocol-2225-delta.md`).
 * The packet arrived at protocol 2193 together with `ServerPresenceInfoPacket`. Mojang's
 * notes split the mutable store and presence configuration out of the immutable gathering
 * data in `StartGamePacket`'s `Server Configuration Join Info`, which still carries both for
 * the initial join; this packet changes the store configuration afterwards.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/server-store-info-packet/
 */
export default class ServerStoreInfoPacket extends NetworkPacket<ServerStoreInfo> {
    public get id(): number {
        return PacketIdentifier.SERVER_STORE_INFO;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ServerStoreInfo): void {
        layoutAt(serverStoreInfoPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ServerStoreInfo {
        return layoutAt(serverStoreInfoPacket, this.codecProtocol).decode(stream);
    }
}
