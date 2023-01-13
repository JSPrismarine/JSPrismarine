import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

export default class WorldEventPacket extends DataPacket {
    public static NetID = Identifiers.WorldEventPacket;

    public eventId!: number;
    public x!: number;
    public y!: number;
    public z!: number;
    public data!: number;

    public decodePayload() {
        this.eventId = this.readVarInt();
        this.x = this.readFloatLE();
        this.y = this.readFloatLE();
        this.z = this.readFloatLE();
        this.data = this.readVarInt();
    }

    public encodePayload() {
        this.writeVarInt(this.eventId);

        this.writeFloatLE(this.x);
        this.writeFloatLE(this.y);
        this.writeFloatLE(this.z);

        this.writeVarInt(this.data);
    }
}
