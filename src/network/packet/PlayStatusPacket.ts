import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class PlayStatusPacket extends DataPacket {
    static NetID = Identifiers.PlayStatusPacket;

    public status!: number;

    public encodePayload() {
        this.writeInt(this.status);
    }

    public decodePayload() {
        this.status = this.readInt();
    }
}
