import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class ShowCreditsPacket extends DataPacket {
    public static NetID = Identifiers.ShowCreditsPacket;

    public runtimeEntityID!: bigint;
    public status!: number;

    public decodePayload() {
        this.runtimeEntityID = this.readVarLong();
        this.status = this.readVarInt();
    }

    public encodePayload() {
        this.writeVarLong(this.runtimeEntityID);
        this.writeVarInt(this.status);
    }
}
