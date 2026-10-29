import { Vector3 } from '@jsprismarine/math';
import { Attribute } from '../../entity/Attribute';
import { Metadata } from '../../entity/Metadata';
import { SyncedProperties } from '../type/SyncedProperties';
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

/** Whether a link's `Type` byte names one of the {@link ActorLinkType} values. */
const isActorLinkType = (value: number): value is ActorLink['type'] =>
    value === ActorLinkType.None || value === ActorLinkType.Riding || value === ActorLinkType.Passenger;

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
 * | Synched Properties | PropertySyncData | Client-synced entity property values |
 * | Actor Links | ActorLink[] | varuint32 count, then each {@link ActorLink} |
 */
export default class AddActorPacket extends DataPacket {
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
    /** Client-synced entity properties, indexed by the actor type's definition packet. */
    public syncedProperties = new SyncedProperties();
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

        this.syncedProperties.networkSerialize(this);

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

    /**
     * Reads the 2193 layout back, the mirror of {@link encodePayload}.
     *
     * The Y Body Rotation is read past rather than kept: the server tracks no body yaw of
     * its own, and the encoder writes `yaw` there.
     * @throws {Error} when a link's `Type` byte is not an {@link ActorLinkType}.
     */
    public decodePayload(): void {
        this.uniqueEntityId = this.readVarLong();
        this.runtimeEntityId = this.readUnsignedVarLong();

        this.type = NetworkUtil.readString(this);

        this.position = NetworkUtil.readVector3(this);
        this.motion = NetworkUtil.readVector3(this);

        this.pitch = this.readFloatLE();
        this.yaw = this.readFloatLE();
        this.headYaw = this.readFloatLE();
        this.readFloatLE(); // Y Body Rotation, written from yaw.

        this.attributes = [];
        for (let i = 0, count = this.readUnsignedVarInt(); i < count; i++) {
            this.attributes.push(Attribute.networkDeserializeInitial(this));
        }

        this.metadata = new Metadata(false);
        this.metadata.networkDeserialize(this);

        this.syncedProperties = SyncedProperties.networkDeserialize(this);

        this.links = [];
        for (let i = 0, count = this.readUnsignedVarInt(); i < count; i++) {
            const targetA = this.readVarLong();
            const targetB = this.readVarLong();

            const type = this.readByte();
            if (!isActorLinkType(type)) {
                throw new Error(`Actor link ${targetA} -> ${targetB} carries unknown link type ${type}`);
            }

            this.links.push({
                targetA,
                targetB,
                type,
                immediate: this.readBoolean(),
                passengerInitiated: this.readBoolean(),
                vehicleAngularVelocity: this.readFloatLE()
            });
        }
    }
}
