import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

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
