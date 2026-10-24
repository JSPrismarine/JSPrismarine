import { Vector3 } from '@jsprismarine/math';
import type { Attribute } from '../../entity/Attribute';
import type { Metadata } from '../../entity/Metadata';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * The `ActorLinkType` values an {@link ActorLink} is sent with.
 */
export const ActorLinkType = {
    None: 0,
    Riding: 1,
    Passenger: 2
} as const;

/**
 * One riding relationship between two entities, in the 2193 `ActorLink` layout.
 */
export interface ActorLink {
    /** Target A, the vehicle's unique id. Written as a ZigZag varint64. */
    targetA: bigint;
    /** Target B, the rider's unique id. Written as a ZigZag varint64. */
    targetB: bigint;
    /** Type, one of {@link ActorLinkType}. Written as a uint8. */
    type: (typeof ActorLinkType)[keyof typeof ActorLinkType];
    /** Immediate: whether the client should skip the mounting animation. */
    immediate: boolean;
    /** Passenger Initiated: whether the passenger changed the link. */
    passengerInitiated: boolean;
    /** Vehicle Angular Velocity, a little-endian float. */
    vehicleAngularVelocity: number;
}

/**
 * Spawns an entity other than a player on the client.
 *
 * Protocol 2193 layout (docs id 13):
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Target Actor ID | varint64 | ZigZag encoded; the runtime id when `uniqueEntityId` is unset |
 * | Target Runtime ID | varuint64 | |
 * | Actor Type | string | The namespaced entity id |
 * | Position | Vec3 | Three little-endian floats |
 * | Velocity | Vec3 | Three little-endian floats |
 * | Rotation | Vec2 | `pitch`, then `yaw`, as little-endian floats |
 * | Y Head Rotation | float | `headYaw` |
 * | Y Body Rotation | float | Written from `yaw`; the server keeps no separate body yaw |
 * | Attributes List | SyncedAttribute[] | varuint32 count; see {@link Attribute.networkSerializeInitial} |
 * | Actor Data | SynchedActorDataList | See {@link Metadata.networkSerialize} |
 * | Synched Properties | PropertySyncData | Two varuint32 counts, both zero: no entity properties are defined |
 * | Actor Links | ActorLink[] | varuint32 count, then each {@link ActorLink} |
 */
export default class AddActorPacket extends DataPacket {
    public static NetID = Identifiers.AddActorPacket;

    /** Zero means the entity has no unique id of its own and goes out under its runtime id. */
    public uniqueEntityId = 0n;
    public runtimeEntityId!: bigint;
    public type!: string;
    public position: Vector3 = new Vector3(0, 0, 0);
    public motion: Vector3 = new Vector3(0, 0, 0);
    public pitch!: number;
    public yaw!: number;
    public headYaw!: number;

    /**
     * The entity's attributes, in the short `AddActor` layout; see
     * {@link Attribute.networkSerializeInitial}. The count used to be hard-coded to zero, so
     * every entity arrived at the client with no health, speed or reach and had to be told
     * separately afterwards.
     */
    public attributes: Attribute[] = [];
    public metadata!: Metadata;
    /** Riding relationships to announce with the entity. The server tracks none yet, so this stays empty. */
    public links: ActorLink[] = [];

    public encodePayload(): void {
        // The server numbers entities once, so the runtime id doubles as the unique id.
        this.writeVarLong(this.uniqueEntityId || this.runtimeEntityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);

        NetworkUtil.writeString(this, this.type);

        NetworkUtil.writeVector3(this, this.position);
        NetworkUtil.writeVector3(this, this.motion);

        // Rotation, then Y Head Rotation, then Y Body Rotation.
        this.writeFloatLE(this.pitch);
        this.writeFloatLE(this.yaw);
        this.writeFloatLE(this.headYaw);
        this.writeFloatLE(this.yaw);

        this.writeUnsignedVarInt(this.attributes.length);
        for (const attribute of this.attributes) attribute.networkSerializeInitial(this);

        this.metadata.networkSerialize(this);

        // Synched Properties: the int entries list and the float entries list, both empty.
        this.writeUnsignedVarInt(0);
        this.writeUnsignedVarInt(0);

        this.writeUnsignedVarInt(this.links.length);
        for (const link of this.links) {
            this.writeVarLong(link.targetA);
            this.writeVarLong(link.targetB);
            this.writeByte(link.type);
            this.writeBoolean(link.immediate);
            this.writeBoolean(link.passengerInitiated);
            this.writeFloatLE(link.vehicleAngularVelocity);
        }
    }
}
