import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class SetTimePacket extends DataPacket {
    static NetID = Identifiers.SetTimePacket;

    public time: number = 0;

    public decodePayload() {
        this.time = this.readVarInt();
    }

    public encodePayload() {
        this.writeVarInt(this.time);
    }
}
