import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class WorldEventPacket extends DataPacket {
    public static NetID = Identifiers.WorldEventPacket;

    public eventId!: number;
    public x!: number;
    public y!: number;
    public z!: number;
    public data!: number;

    public decodePayload() {
        this.eventId = this.readVarInt();
        this.x = this.readLFloat();
        this.y = this.readLFloat();
        this.z = this.readLFloat();
        this.data = this.readVarInt();
    }

    public encodePayload() {
        this.writeVarInt(this.eventId);

        this.writeLFloat(this.x);
        this.writeLFloat(this.y);
        this.writeLFloat(this.z);

        this.writeVarInt(this.data);
    }
}
