import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export enum CompressionThreshold {
    COMPRESS_NOTHING,
    COMPRESS_EVERYTHING
}

// `PacketCompressionAlgorithm` lives in `@jsprismarine/minecraft`, where every other
// protocol enum does. A copy here declared `NONE` as `0xffff & 0xff` - 255 - reasoning that
// the field is a byte. It is not: `compressionAlgorithm` is written with
// `writeUnsignedShortLE` a few lines below, and Mojang's documentation for protocol 748
// says 0xffff. The copy shadowed the real one for every importer.

export default class NetworkSettingsPacket extends DataPacket {
    public static NetID = Identifiers.NetworkSettingsPacket;

    public compressionThreshold!: number;
    public compressionAlgorithm!: number;

    public clientThrottlingEnabled!: boolean;
    public clientThrottleThreshold!: number;
    public clientThrottleScalar!: number;

    public decodePayload(): void {
        this.compressionThreshold = this.readUnsignedShortLE();
        this.compressionAlgorithm = this.readUnsignedShortLE();
        this.clientThrottlingEnabled = this.readBoolean();
        this.clientThrottleThreshold = this.readByte();
        this.clientThrottleScalar = this.readFloatLE();
    }

    public encodePayload(): void {
        this.writeUnsignedShortLE(this.compressionThreshold);
        this.writeUnsignedShortLE(this.compressionAlgorithm);
        this.writeBoolean(this.clientThrottlingEnabled);
        this.writeByte(this.clientThrottleThreshold);
        this.writeFloatLE(this.clientThrottleScalar);
    }
}
