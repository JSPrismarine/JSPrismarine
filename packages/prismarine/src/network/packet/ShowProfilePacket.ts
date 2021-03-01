import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class ShowProfilePacket extends DataPacket {
    public static NetID = Identifiers.ShowProfilePacket;

    public xuid!: string;

    public decodePayload() {
        this.xuid = this.readString();
    }

    public encodePayload() {
        this.writeString(this.xuid);
    }
}
