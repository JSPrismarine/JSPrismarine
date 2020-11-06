import Identifiers from '../Identifiers';
import DataPacket from './Packet';

export default class WorldEventPacket extends DataPacket {
    static NetID = Identifiers.WorldEventPacket;

    public eventId: VarInt = 0;
    public x: LFloat = 0;
    public y: LFloat = 0;
    public z: LFloat = 0;
    public data: VarInt = 0;

    public decodePayload() {
        this.eventId = this.readVarInt();
        this.x = this.readLFloat();
        this.y = this.readLFloat();
        this.z = this.readLFloat();
        this.data = this.readVarInt();
    }

    public encodePayload() {
        this.writeVarInt(this.eventId as number);

        this.writeLFloat(this.x as number);
        this.writeLFloat(this.y as number);
        this.writeLFloat(this.z as number);

        this.writeVarInt(this.data as number);
    }
}
