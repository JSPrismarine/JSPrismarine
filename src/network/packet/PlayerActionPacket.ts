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
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeVarInt(this.action);
        this.writeVarInt(this.x);
        this.writeUnsignedVarInt(this.y);
        this.writeVarInt(this.z);
        this.writeVarInt(this.face);
    }
}
