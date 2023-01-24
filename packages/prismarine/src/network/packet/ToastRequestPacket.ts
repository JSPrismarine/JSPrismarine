import Identifiers from '../Identifiers.js';
import McpeUtil from '../NetworkUtil.js';
import DataPacket from './DataPacket.js';

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