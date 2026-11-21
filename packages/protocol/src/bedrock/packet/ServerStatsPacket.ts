import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { serverStatsPacket } from '../wire/definitions/serverStats';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';

/** The fields of a `ServerStatsPacket`, in wire order. */
export interface ServerStats {
    /** `ServerTime`, a little-endian 32-bit float. The docs give no unit. */
    serverTime: number;
    /** `NetworkTime`, a little-endian 32-bit float. The docs give no unit. */
    networkTime: number;
}

/**
 * Performance figures the server reports to the client.
 *
 * Protocols 2193 and 2225 share one layout, in wire order: `ServerTime` then `NetworkTime`, each a
 * little-endian 32-bit float. Mojang's docs mark it as sent from the server only and do not say
 * what unit the two timings are in.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/server-stats-packet/
 */
export default class ServerStatsPacket extends NetworkPacket<ServerStats> {
    public get id(): number {
        return PacketIdentifier.SERVER_STATS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ServerStats): void {
        layoutAt(serverStatsPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ServerStats {
        return layoutAt(serverStatsPacket, this.codecProtocol).decode(stream);
    }
}
