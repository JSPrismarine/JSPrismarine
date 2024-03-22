import Identifiers from '../Identifiers';
import McpeUtil from '../NetworkUtil';
import DataPacket from './DataPacket';

export default class ToastRequestPacket extends DataPacket {
    public static NetID = Identifiers.ToastRequestPacket;

    public title!: string;
    public body!: string;

    public decodePayload() {
        this.title = McpeUtil.readString(this);
        this.body = McpeUtil.readString(this);
    }

    public encodePayload() {
        McpeUtil.writeString(this, this.title);
        McpeUtil.writeString(this, this.body);
    }
}
