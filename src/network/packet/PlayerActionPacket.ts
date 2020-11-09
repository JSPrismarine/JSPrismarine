import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class PlayerActionPacket extends DataPacket {
    static NetID = Identifiers.PlayerActionPacket;

    public runtimeEntityId: UnsignedVarLong = BigInt(0);
    public action: number = 0;
    public x: number = 0;
    public y: number = 0;
    public z: number = 0;
    public face: number = 0;

    public decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.action = this.readVarInt();

        this.x = this.readVarInt();
        this.y = this.readUnsignedVarInt();
        this.z = this.readVarInt();

        this.face = this.readVarInt();
    }

    public encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId as bigint);
        this.writeVarInt(this.action as number);
        this.writeVarInt(this.x as number);
        this.writeUnsignedVarInt(this.y as number);
        this.writeVarInt(this.z as number);
        this.writeVarInt(this.face as number);
    }
}
