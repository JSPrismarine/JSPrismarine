import type { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import DataPacket from './DataPacket';

/**
 * The two `Compression Threshold` values this server has a name for.
 *
 * The field is a raw uint16 byte count, not an enum: zero turns compression off and any other
 * value is the smallest payload worth compressing. `COMPRESS_EVERYTHING` is 1 because one byte
 * is the smallest payload there is.
 */
export enum CompressionThreshold {
    COMPRESS_NOTHING = 0,
    COMPRESS_EVERYTHING = 1
}

/**
 * The compression terms every later batch is framed under, sent uncompressed in answer to
 * `RequestNetworkSettingsPacket`.
 *
 * Protocol 2193 wire order, with the docs' field names: `Compression Threshold` (uint16 little
 * endian), `CompressionAlgorithm` (uint16 little endian holding a `PacketCompressionAlgorithm`),
 * `Client Throttle Enabled` (boolean), `Client Throttle Threshold` (uint8) and
 * `Client Throttle Scalar` (float, little endian).
 *
 * `CompressionAlgorithm` is numbered as the 1.26.51 docs list `PacketCompressionAlgorithm`:
 * ZLib 0, Snappy 1, None 2. `@jsprismarine/minecraft` carries `NONE` as 65535, the value
 * protocol 2207 moved it to. This server only ever sends `ZLIB`, and a batch's own one byte
 * prefix says 0xff for none either way.
 *
 * **Bound To:** Client
 */
export default class NetworkSettingsPacket extends DataPacket {
    /** `Compression Threshold`: the smallest payload that gets compressed, or 0 for none. */
    public compressionThreshold!: number;
    /** `CompressionAlgorithm` that every later batch is compressed with. */
    public compressionAlgorithm!: PacketCompressionAlgorithm;

    /** `Client Throttle Enabled`: whether the client stops ticking players past the threshold. */
    public clientThrottlingEnabled!: boolean;
    /** `Client Throttle Threshold`: how many players the client ticks before throttling. */
    public clientThrottleThreshold!: number;
    /** `Client Throttle Scalar`: how hard it throttles once it does. */
    public clientThrottleScalar!: number;

    /** Reads the five fields in the protocol 2193 order described on the class. */
    public decodePayload(): void {
        this.compressionThreshold = this.readUnsignedShortLE();
        this.compressionAlgorithm = this.readUnsignedShortLE();
        this.clientThrottlingEnabled = this.readBoolean();
        this.clientThrottleThreshold = this.readByte();
        this.clientThrottleScalar = this.readFloatLE();
    }

    /** Writes the five fields in the protocol 2193 order described on the class. */
    public encodePayload(): void {
        this.writeUnsignedShortLE(this.compressionThreshold);
        this.writeUnsignedShortLE(this.compressionAlgorithm);
        this.writeBoolean(this.clientThrottlingEnabled);
        this.writeByte(this.clientThrottleThreshold);
        this.writeFloatLE(this.clientThrottleScalar);
    }
}
