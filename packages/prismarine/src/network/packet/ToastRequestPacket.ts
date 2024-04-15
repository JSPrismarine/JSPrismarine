import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ToastRequestPacket extends DataPacket {
    public static NetID = Identifiers.ToastRequestPacket;

    public title!: string;
    public body!: string;

    public decodePayload() {
        this.title = NetworkUtil.readString(this);
        this.body = NetworkUtil.readString(this);
    }

    public encodePayload() {
        NetworkUtil.writeString(this, this.title);
        NetworkUtil.writeString(this, this.body);
    }
}
