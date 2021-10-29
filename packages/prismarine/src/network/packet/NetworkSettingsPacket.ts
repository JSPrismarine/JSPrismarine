import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export enum NetworkCompression {
    COMPRESS_NOTHING,
    COMPRESS_EVERYTHING
}

export default class NetworkSettingsPacket extends DataPacket {
    public static NetID = Identifiers.NetworkSettingsPacket;

    public compressionThreshold!: number;

    public decodePayload() {
        this.compressionThreshold = this.readUnsignedShortLE();
    }

    public encodePayload() {
        this.writeUnsignedShortLE(this.compressionThreshold);
    }
}
