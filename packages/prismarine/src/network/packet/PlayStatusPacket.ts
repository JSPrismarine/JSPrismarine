import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

export default class PlayStatusPacket extends DataPacket {
    public static NetID = Identifiers.PlayStatusPacket;

    public status!: number;

    public encodePayload() {
        this.writeInt(this.status);
    }

    public decodePayload() {
        this.status = this.readInt();
    }
}
