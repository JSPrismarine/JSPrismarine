import type { Metadata } from '../../entity/Metadata';
import type { Item } from '../../item/Item';
import Vector3 from '../../math/Vector3';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Packet for adding an dropped item to the game.
 *
 * **Bound To:** Client
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | uniqueEntityId | VarLong | |
 * | runtimeEntityId | UnsignedVarLong | |
 * | item | Item | The item/block |
 * | position | Vector3 (LFloat) | The entity's position |
 * | motion | Vector3 (LFloat) | The entity's motion |
 * | metadata |  | TODO|
 * | isFromFishing | Boolean | |
 */
export default class AddItemActorPacket extends DataPacket {
    public static NetID = Identifiers.AddItemActorPacket;

    public uniqueEntityId!: bigint;
    public runtimeEntityId!: bigint;
    public item!: Item;
    public position!: Vector3;
    public motion = new Vector3(0, 0, 0);

    public metadata!: Metadata;
    public isFromFishing = false;

    public encodePayload() {
        this.writeVarLong(this.uniqueEntityId || this.runtimeEntityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);

        this.item.networkSerialize(this);

        this.position.networkSerialize(this);
        this.motion.networkSerialize(this);

        this.metadata.networkSerialize(this);

        this.writeBoolean(this.isFromFishing);
    }
}
