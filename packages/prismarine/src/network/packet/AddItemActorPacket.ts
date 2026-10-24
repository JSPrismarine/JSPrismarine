import { Vector3 } from '@jsprismarine/math';
import type { Metadata } from '../../entity/Metadata';
import type { Item } from '../../item/Item';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Spawns a dropped item on the client.
 *
 * Protocol 2193 layout (docs id 15):
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Target Actor ID | varint64 | ZigZag encoded; the runtime id when `uniqueEntityId` is unset |
 * | Target Runtime ID | varuint64 | |
 * | Item | NetworkItemStackDescriptor | See {@link Item.networkSerialize} |
 * | Position | Vec3 | Three little-endian floats |
 * | Velocity | Vec3 | Three little-endian floats |
 * | Entity Data | SynchedActorDataList | See {@link Metadata.networkSerialize} |
 * | Is From Fishing | boolean | |
 */
export default class AddItemActorPacket extends DataPacket {
    public static NetID = Identifiers.AddItemActorPacket;

    /** Zero means the item has no unique id of its own and goes out under its runtime id. */
    public uniqueEntityId = 0n;
    public runtimeEntityId!: bigint;
    public item!: Item;
    public position!: Vector3;
    public motion = new Vector3(0, 0, 0);

    public metadata!: Metadata;
    public isFromFishing = false;

    public encodePayload(): void {
        // The server numbers entities once, so the runtime id doubles as the unique id.
        this.writeVarLong(this.uniqueEntityId || this.runtimeEntityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);

        this.item.networkSerialize(this);

        NetworkUtil.writeVector3(this, this.position);
        NetworkUtil.writeVector3(this, this.motion);

        this.metadata.networkSerialize(this);

        this.writeBoolean(this.isFromFishing);
    }
}
