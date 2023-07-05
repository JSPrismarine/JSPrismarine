import BlockPosition from '../../world/BlockPosition.js';
import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

export default class PlayerActionPacket extends DataPacket {
    public static NetID = Identifiers.PlayerActionPacket;

    public runtimeEntityId!: bigint;
    public action!: number;
    public position!: BlockPosition;
    public face!: number;

    public decodePayload(): void {
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.action = this.readVarInt();
        this.position = BlockPosition.networkDeserialize(this);

        // TODO
        BlockPosition.networkDeserialize(this);

        this.face = this.readVarInt();
    }

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeVarInt(this.action);
        this.position.networkSerialize(this);

        // TODO
        new BlockPosition(0, 0, 0).networkSerialize(this);

        this.writeVarInt(this.face);
    }
}
