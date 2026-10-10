import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

export interface NetworkSettings {
    /**
     * Payloads shorter than this are sent uncompressed. Zero disables compression outright;
     * it does not mean "compress everything from zero bytes up".
     */
    compressionThreshold: number;
    /** Two bytes wide here, where none is `0xffff` - each batch then repeats it in one. */
    compressionAlgorithm: number;
    clientThrottlingEnabled: boolean;
    clientThrottleThreshold: number;
    clientThrottleScalar: number;
}

/**
 * The server's answer, and the last packet with no compression prefix: it is itself sent
 * uncompressed, and everything after it carries the algorithm byte.
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
