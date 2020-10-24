import Identifiers from "../Identifiers";
import DataPacket from "./Packet";

export default class WorldEventPacket extends DataPacket {
    static NetID = Identifiers.WorldEventPacket

    eventId: VarInt = 0;
    x: LFloat = 0
    y: LFloat = 0
    z: LFloat = 0
    data: VarInt = 0;

    decodePayload() {
        this.eventId = this.readVarInt();
        this.x = this.readLFloat();
        this.y = this.readLFloat();
        this.z = this.readLFloat();
        this.data = this.readVarInt();
    }

    encodePayload() {
        this.writeVarInt(this.eventId);

        this.writeLFloat(this.x);
        this.writeLFloat(this.y);
        this.writeLFloat(this.z);

        this.writeVarInt(this.data);
    }
};
