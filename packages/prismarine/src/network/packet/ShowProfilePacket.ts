import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';
import McpeUtil from '../NetworkUtil.js';

export default class ShowProfilePacket extends DataPacket {
    public static NetID = Identifiers.ShowProfilePacket;

    public xuid!: string;

    public decodePayload() {
        this.xuid = McpeUtil.readString(this);
    }

    public encodePayload() {
        McpeUtil.writeString(this, this.xuid);
    }
}
