import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { serverPresenceInfoPacket } from '../wire/definitions/serverPresenceInfo';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { ServerPresenceInfoPayload } from '../wire/definitions/serverPresenceInfo';

/** The fields of a `ServerPresenceInfoPacket`, in wire order. */
export type ServerPresenceInfo = ServerPresenceInfoPayload;

/**
 * Tells the client which rich presence to show while connected.
 *
 * Wire order at both protocol versions: `presence_configuration` as an optional
 * {@link PresenceConfig}, a presence byte then the configuration when set. The configuration is
 * `richPresenceId` as an optional string: a presence byte, then the string (a varuint32 byte
 * length followed by UTF-8) only when set. Nothing else follows. The 1.26.50 page prints the
 * configuration as plain and the 1.26.60 page as optional; the changelog row "is now optional"
 * is a documentation correction (`docs/research/protocol-2225-delta.md`), so the presence byte is
 * not gated by version.
 *
 * The packet arrived at protocol 2193 together with `ServerStoreInfoPacket`. Mojang's notes
 * split the mutable store and presence configuration out of the immutable gathering data in
 * `StartGamePacket`'s `Server Configuration Join Info`, which still carries both for the
 * initial join; this packet changes the presence afterwards. Only trusted dedicated servers
 * get to override the client's rich presence.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/server-presence-info-packet/
 */
export default class ServerPresenceInfoPacket extends NetworkPacket<ServerPresenceInfo> {
    public get id(): number {
        return PacketIdentifier.SERVER_PRESENCE_INFO;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ServerPresenceInfo): void {
        layoutAt(serverPresenceInfoPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ServerPresenceInfo {
        return layoutAt(serverPresenceInfoPacket, this.codecProtocol).decode(stream);
    }
}
