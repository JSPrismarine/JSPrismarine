import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class TransferPacket extends DataPacket {
    public static NetID = Identifiers.TransferPacket;

    public address!: string;
    public port!: number;

    public decodePayload(): void {
        this.address = NetworkUtil.readString(this);
        this.port = this.readUnsignedShortLE();
    }

    public encodePayload(): void {
        NetworkUtil.writeString(this, this.address);
        this.writeUnsignedShortLE(this.port);
    }
}
