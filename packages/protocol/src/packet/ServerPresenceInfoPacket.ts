import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import PresenceConfig from '../structure/PresenceConfig';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `ServerPresenceInfoPacket`, in wire order. */
export interface ServerPresenceInfo {
    /** `presence_configuration`, the rich presence the client should show. */
    presenceConfiguration: PresenceConfig;
}

/**
 * Tells the client which rich presence to show while connected.
 *
 * Protocol 2193 layout, in wire order: `presence_configuration` as a {@link PresenceConfig},
 * which is `richPresenceId` as an optional string: a presence byte, then the string (a
 * varuint32 byte length followed by UTF-8) only when set. Nothing else follows. The schema
 * marks the configuration itself required, so there is one presence byte, not two;
 * gophertunnel master wraps the configuration in a second optional, which the docs do not
 * support.
 *
 * The packet arrived at protocol 2193 together with `ServerStoreInfoPacket`. Mojang's notes
 * split the mutable store and presence configuration out of the immutable gathering data in
 * `StartGamePacket`'s `Server Configuration Join Info`, which still carries both for the
 * initial join; this packet changes the presence afterwards. Only trusted dedicated servers
 * get to override the client's rich presence.
 */
export default class ServerPresenceInfoPacket extends NetworkPacket<ServerPresenceInfo> {
    public get id(): number {
        return PacketIdentifier.SERVER_PRESENCE_INFO;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ServerPresenceInfo): void {
        data.presenceConfiguration.serialize(stream);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ServerPresenceInfo {
        return { presenceConfiguration: PresenceConfig.deserialize(stream) };
    }
}
