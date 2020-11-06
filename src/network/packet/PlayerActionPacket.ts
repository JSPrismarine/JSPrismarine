import Identifiers from '../Identifiers';
import DataPacket from './Packet';

export default class PlayerActionPacket extends DataPacket {
    static NetID = Identifiers.PlayerActionPacket;

    runtimeEntityId: UnsignedVarLong = BigInt(0);
    action: VarInt = 0;
    x: VarInt = 0;
    y: UnsignedVarInt = 0;
    z: VarInt = 0;
    face: VarInt = 0;

    decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.action = this.readVarInt();

        this.x = this.readVarInt();
        this.y = this.readUnsignedVarInt();
        this.z = this.readVarInt();

        this.face = this.readVarInt();
    }

    encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId as bigint);
        this.writeVarInt(this.action as number);
        this.writeVarInt(this.x as number);
        this.writeUnsignedVarInt(this.y as number);
        this.writeVarInt(this.z as number);
        this.writeVarInt(this.face as number);
    }
}
