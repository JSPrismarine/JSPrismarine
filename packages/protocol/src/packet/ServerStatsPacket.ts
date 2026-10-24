import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `ServerStatsPacket`, in wire order. */
export interface ServerStats {
    /** `ServerTime`, how long the server spent on its last tick. */
    serverTime: number;
    /** `NetworkTime`, how long the server spent on networking in its last tick. */
    networkTime: number;
}

/**
 * Performance figures the server reports to the client.
 *
 * Protocol 2193 layout, in wire order: `ServerTime` then `NetworkTime`, each a little-endian
 * 32-bit float. Mojang's docs mark it as sent from the server only and do not say what unit the
 * two timings are in.
 */
export default class ServerStatsPacket extends NetworkPacket<ServerStats> {
    public get id(): number {
        return PacketIdentifier.SERVER_STATS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ServerStats): void {
        stream.writeFloatLE(data.serverTime);
        stream.writeFloatLE(data.networkTime);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ServerStats {
        return {
            serverTime: stream.readFloatLE(),
            networkTime: stream.readFloatLE()
        };
    }
}
