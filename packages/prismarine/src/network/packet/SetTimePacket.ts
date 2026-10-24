import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class SetTimePacket extends DataPacket {
    public static NetID = Identifiers.SetTimePacket;

    public time!: number;

    public decodePayload(): void {
        this.time = this.readVarInt();
    }

    public encodePayload(): void {
        this.writeVarInt(this.time);
    }
}
