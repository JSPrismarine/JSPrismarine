import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import McpeUtil from '../NetworkUtil';

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
