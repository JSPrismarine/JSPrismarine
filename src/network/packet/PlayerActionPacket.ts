import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class PlayerActionPacket extends DataPacket {
    static NetID = Identifiers.PlayerActionPacket;

    public runtimeEntityId!: bigint;
    public action!: number;
    public x!: number;
    public y!: number;
    public z!: number;
    public face!: number;

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
