import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class TransferPacket extends DataPacket {
    public static NetID = Identifiers.TransferPacket;

    public address!: string;
    public port!: number;

    public decodePayload() {
        this.address = this.readString();
        this.port = this.readLShort();
    }

    public encodePayload() {
        this.writeString(this.address);
        this.writeLShort(this.port);
    }
}
