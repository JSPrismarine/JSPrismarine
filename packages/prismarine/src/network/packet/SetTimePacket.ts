import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

export default class SetTimePacket extends DataPacket {
    public static NetID = Identifiers.SetTimePacket;

    public time!: number;

    public decodePayload() {
        this.time = this.readVarInt();
    }

    public encodePayload() {
        this.writeVarInt(this.time);
    }
}
