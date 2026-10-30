import { Vector3 } from '@jsprismarine/math';
import { layoutAt } from '@jsprismarine/protocol';
import type { Attribute } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';
import { SyncedProperties } from '@jsprismarine/protocol/wire/structures/SyncedProperties';
import type { PassengerOfBlock } from '@jsprismarine/protocol/wire/structures/PassengerOfBlock';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';
import { addActorPacket } from '@jsprismarine/protocol/wire/definitions/addActor';

import type { ActorLink } from '@jsprismarine/protocol/wire/definitions/addActor';

/**
 * Re-export: the link and its type values are wire structures and live with the packet's
 * declarative layout in `@jsprismarine/protocol`. This path stays so the server's importers
 * keep working.
 */
export { ActorLinkType } from '@jsprismarine/protocol/wire/definitions/addActor';
export type { ActorLink } from '@jsprismarine/protocol/wire/definitions/addActor';

/**
 * Spawns an entity other than a player on the client.
 *
 * The wire layout lives in `addActor.wire.ts`'s declarative definition, which this class
 * walks at the protocol version stamped on it: the 2193 fields below, plus the trailing
 * optional `Passenger Block Data` from 2225 on.
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
export default class AddActorPacket extends FieldNetworkPacket {
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

    /** Passenger Block Data, from 2225 on: the ridden block, or `null` for not riding. */
    public passengerOfBlock: PassengerOfBlock | null = null;

    /**
     * The `Target Actor ID` the layout writes. The server numbers entities once, so the
     * runtime id doubles as the unique id when no unique id was set.
     */
    public get targetActorId(): bigint {
        return this.uniqueEntityId || this.runtimeEntityId;
    }

    public set targetActorId(value: bigint) {
        this.uniqueEntityId = value;
    }

    /** The `Y Body Rotation` the layout writes; the server tracks no body yaw of its own. */
    public get bodyYaw(): number {
        return this.yaw;
    }

    public set bodyYaw(_value: number) {
        // Read past rather than kept: the encoder writes `yaw` here.
    }

    /** Writes the fields the stamped protocol version puts on the wire, in layout order. */
    public encodePayload(): void {
        layoutAt(addActorPacket, this.codecProtocol).encode(this, this);
    }

    /**
     * Reads them back in the same order, filling version-absent fields with their fallbacks.
     * @throws {Error} when a link's `Type` byte is not an {@link ActorLinkType}.
     */
    public decodePayload(): void {
        Object.assign(this, layoutAt(addActorPacket, this.codecProtocol).decode(this));
    }
}
