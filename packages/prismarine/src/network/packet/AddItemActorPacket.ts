import { Vector3 } from '@jsprismarine/math';
import type { Metadata } from '../../entity/Metadata';
import type { Item } from '../../item/Item';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
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

        NetworkUtil.writeVector3(this, this.position);
        NetworkUtil.writeVector3(this, this.motion);

        this.metadata.networkSerialize(this);

        this.writeBoolean(this.isFromFishing);
    }
}
