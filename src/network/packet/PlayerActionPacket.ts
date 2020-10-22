import Identifiers from "../identifiers";
import DataPacket from "./Packet";

export default class PlayerActionPacket extends DataPacket {
    static NetID = Identifiers.PlayerActionPacket

    runtimeEntityId: bigint = BigInt(0);
    action: number = 0;

    x: number = 0;
    y: number = 0;
    z: number = 0;

    face: number = 0;

    decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.action = this.readVarInt();

        this.x = this.readVarInt();
        this.y = this.readUnsignedVarInt();
        this.z = this.readVarInt();

        this.face = this.readVarInt();
    }
}
