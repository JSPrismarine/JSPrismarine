import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class WorldEventPacket extends DataPacket {
    static NetID = Identifiers.WorldEventPacket;

    public eventId: number = 0;
    public x: number = 0;
    public y: number = 0;
    public z: number = 0;
    public data: number = 0;

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
