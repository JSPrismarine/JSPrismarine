import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `NetworkSettingsPacket`, in wire order. */
export interface NetworkSettings {
    /**
     * `Compression Threshold`: the smallest payload, in bytes, that gets compressed. Zero
     * disables compression outright and 1 compresses everything.
     */
    compressionThreshold: number;
    /**
     * `CompressionAlgorithm`, numbered as the 1.26.51 docs list `PacketCompressionAlgorithm`:
     * ZLib 0, Snappy 1, None 2. `@jsprismarine/minecraft` carries `NONE` as 65535, the value
     * protocol 2207 moved it to. Two bytes wide here; each batch then repeats it in one, where
     * none is 0xff.
     */
    compressionAlgorithm: PacketCompressionAlgorithm;
    /** `Client Throttle Enabled`: whether the client stops ticking players past the threshold. */
    clientThrottlingEnabled: boolean;
    /** `Client Throttle Threshold`: how many players the client ticks before throttling. */
    clientThrottleThreshold: number;
    /** `Client Throttle Scalar`: how hard it throttles once it does. */
    clientThrottleScalar: number;
}

/**
 * The server's answer to `RequestNetworkSettingsPacket`, and the last packet with no
 * compression prefix: it is itself sent uncompressed, and everything after it carries the
 * algorithm byte.
 *
 * Protocol 2193 layout after the header: `Compression Threshold` as a little-endian uint16,
 * `CompressionAlgorithm` as a little-endian uint16, `Client Throttle Enabled` as one byte,
 * `Client Throttle Threshold` as a uint8, then `Client Throttle Scalar` as a little-endian
 * float.
 */
export default class NetworkSettingsPacket extends NetworkPacket<NetworkSettings> {
    public get id(): number {
        return PacketIdentifier.NETWORK_SETTINGS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: NetworkSettings): void {
        stream.writeUnsignedShortLE(data.compressionThreshold);
        stream.writeUnsignedShortLE(data.compressionAlgorithm);
        stream.writeBoolean(data.clientThrottlingEnabled);
        stream.writeByte(data.clientThrottleThreshold);
        stream.writeFloatLE(data.clientThrottleScalar);
    }

    protected deserializePayload(stream: NetworkBinaryStream): NetworkSettings {
        return {
            compressionThreshold: stream.readUnsignedShortLE(),
            compressionAlgorithm: stream.readUnsignedShortLE(),
            clientThrottlingEnabled: stream.readBoolean(),
            clientThrottleThreshold: stream.readByte(),
            clientThrottleScalar: stream.readFloatLE()
        };
    }
}
