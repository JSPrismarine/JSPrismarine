import BlockPosition from '../../world/BlockPosition';
import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class PlayerActionPacket extends DataPacket {
    public static NetID = Identifiers.PlayerActionPacket;

    public runtimeEntityId!: bigint;
    public action!: number;
    public position!: BlockPosition;
    public face!: number;

    public decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.action = this.readVarInt();
        this.position = this.readBlockPosition();
        this.face = this.readVarInt();
    }

    public encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeVarInt(this.action);
        this.writeBlockPosition(this.position);
        this.writeVarInt(this.face);
    }
}
