import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';
import McpeUtil from '../NetworkUtil.js';

export default class TransferPacket extends DataPacket {
    public static NetID = Identifiers.TransferPacket;

    public address!: string;
    public port!: number;

    public decodePayload() {
        this.address = McpeUtil.readString(this);
        this.port = this.readUnsignedShortLE();
    }

    public encodePayload() {
        McpeUtil.writeString(this, this.address);
        this.writeUnsignedShortLE(this.port);
    }
}
