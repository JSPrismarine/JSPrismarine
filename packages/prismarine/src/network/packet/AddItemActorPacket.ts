import type ContainerEntry from '../../inventory/ContainerEntry';
import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import Vector3 from '../../math/Vector3';

export default class AddItemActorPacket extends DataPacket {
    public static NetID = Identifiers.AddItemActorPacket;

    public uniqueEntityId!: bigint;
    public runtimeEntityId!: bigint;
    public item!: ContainerEntry;
    public position!: Vector3;
    public motion = new Vector3(0, 0, 0);

    // public metadata!: any[] = [];
    public isFromFishing = false;

    public encodePayload() {
        this.writeVarLong(this.uniqueEntityId || this.runtimeEntityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);

        this.item.networkSerialize(this);

        this.position.networkSerialize(this);
        this.motion.networkSerialize(this);

        // TODO: metadata
        this.writeUnsignedVarInt(0);

        this.writeBool(this.isFromFishing);
    }
}
