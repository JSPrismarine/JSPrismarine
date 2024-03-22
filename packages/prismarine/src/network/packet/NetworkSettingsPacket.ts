import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export enum CompressionThreshold {
    COMPRESS_NOTHING,
    COMPRESS_EVERYTHING
}

export enum CompressionAlgorithm {
    ZLIB,
    SNAPPY
}

export default class NetworkSettingsPacket extends DataPacket {
    public static NetID = Identifiers.NetworkSettingsPacket;

    public compressionThreshold!: number;
    public compressionAlgorithm!: number;

    public enableClientThrottling!: boolean;
    public clientThrottleThreshold!: number;
    public clientThrottleScalar!: number;

    public decodePayload() {
        this.compressionThreshold = this.readUnsignedShortLE();
        this.compressionAlgorithm = this.readUnsignedShortLE();
        this.enableClientThrottling = this.readBoolean();
        this.clientThrottleThreshold = this.readByte();
        this.clientThrottleScalar = this.readFloatLE();
    }

    public encodePayload() {
        this.writeUnsignedShortLE(this.compressionThreshold);
        this.writeUnsignedShortLE(this.compressionAlgorithm);
        this.writeBoolean(this.enableClientThrottling);
        this.writeByte(this.clientThrottleThreshold);
        this.writeFloatLE(this.clientThrottleScalar);
    }
}
