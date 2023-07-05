import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';
import Vector3 from '../../math/Vector3.js';
import type Item from '../../item/Item.js';

/**
 * Packet for adding an dropped item to the game.
 *
 * **Bound To:** Client
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | uniqueEntityId | VarLong | |
 * | runtimeEntityId | UnsignedVarLong | |
 * | item | ContainerEntry | The item/block |
 * | position | Vector3 (LFloat) | The entity's position |
 * | motion | Vector3 (LFloat) | The entity's motion |
 * | metadata |  | TODO|
 * | isFromFishing | Boolean | |
 *
 * @public
 */
export default class AddItemActorPacket extends DataPacket {
    public static NetID = Identifiers.AddItemActorPacket;

    public uniqueEntityId!: bigint;
    public runtimeEntityId!: bigint;
    public item!: Item;
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

        this.writeBoolean(this.isFromFishing);
    }
}
