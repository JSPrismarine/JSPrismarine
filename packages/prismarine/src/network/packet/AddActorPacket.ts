import { Vector3 } from '@jsprismarine/math';
import type { Attribute } from '../../entity/Attribute';
import type { Metadata } from '../../entity/Metadata';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Packet for adding an entity to the game.
 *
 * **Bound To:** Client
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | uniqueEntityId | VarLong | |
 * | runtimeEntityId | UnsignedVarLong | |
 * | type | String | The namespaced entity ID |
 * | position | Vector3 (LFloat) | The entity's position |
 * | motion | Vector3 (LFloat) | The entity's motion |
 * | pitch | LFloat |  |
 * | yaw | LFloat |  |
 * | headYaw | LFloat |  |
 */
export default class AddActorPacket extends DataPacket {
    public static NetID = Identifiers.AddActorPacket;

    public uniqueEntityId!: bigint;
    public runtimeEntityId!: bigint;
    public type!: string;
    public position: Vector3 = new Vector3(0, 0, 0);
    public motion: Vector3 = new Vector3(0, 0, 0);
    public pitch!: number;
    public yaw!: number;
    public headYaw!: number;

    /**
     * The entity's attributes, in the short `AddActor` layout - see
     * {@link Attribute.networkSerializeInitial}. This used to be an empty array that was
     * never read: the count was hard-coded to zero, so every entity arrived at the client
     * with no health, no speed and no reach, and had to be told separately afterwards.
     */
    public attributes: Attribute[] = [];
    public metadata!: Metadata;
    public links = [];

    public encodePayload(): void {
        this.writeVarLong(this.uniqueEntityId || this.runtimeEntityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);

        NetworkUtil.writeString(this, this.type);

        this.writeFloatLE(this.position.getX());
        this.writeFloatLE(this.position.getY());
        this.writeFloatLE(this.position.getZ());

        this.writeFloatLE(this.motion.getX());
        this.writeFloatLE(this.motion.getY());
        this.writeFloatLE(this.motion.getZ());

        this.writeFloatLE(this.pitch);
        this.writeFloatLE(this.yaw);
        this.writeFloatLE(this.headYaw);
        this.writeFloatLE(this.yaw); // bodyYaw

        this.writeUnsignedVarInt(this.attributes.length);
        for (const attribute of this.attributes) attribute.networkSerializeInitial(this);

        this.metadata.networkSerialize(this);

        // Entity properties: the int list and the float list, both empty. Named now rather
        // than left as "? unknown", because the client reads two counts here whatever we
        // call them.
        this.writeUnsignedVarInt(0);
        this.writeUnsignedVarInt(0);

        // TODO: links
        this.writeUnsignedVarInt(this.links.length);
    }
}
