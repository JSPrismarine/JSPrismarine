import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class SetHealthPacket extends DataPacket {
    public static NetID = Identifiers.SetHealthPacket;

    public health!: number;

    public decodePayload() {
        this.health = this.readVarInt();
    }

    public encodePayload() {
        this.writeVarInt(this.health);
    }
}
