/**
 * `AddActorPacket`: spawns an entity other than a player on the client, described as a
 * declarative field list.
 *
 * Field names and order follow the docs' packet page (docs id 13). `Passenger Block Data`
 * was appended at protocol 2225 as a trailing optional `PassengerOfBlockArguments`, verified
 * against the v1.26.60 `metadata.zip` (`AddActorPacketPayload.json`) and gophertunnel's
 * `AddActor.Marshal` at v1.63.0 (`OptionalMarshaler` of `PassengerOfBlock` last), which
 * agree. Nothing before it changed.
 */
import { definePacket, gated } from '../define';
import * as t from '../fieldTypes';
import { Attribute } from '../structures/Attribute';
import { metadata, passengerOfBlock, syncedProperties, vector3 } from '../structureTypes';
import { SINCE_2225 } from '../wireGates';

import type { PayloadOf } from '../define';

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
 * `ActorLink[]`: a varuint count, then each riding relationship's six 2193 fields.
 * @throws {Error} when a link's `Type` byte is not an {@link ActorLinkType}.
 */
export const actorLinks = t.custom<ActorLink[]>(
    'ActorLink[]',
    (stream, value) => {
        stream.writeUnsignedVarInt(value.length);
        for (const link of value) {
            stream.writeVarLong(link.targetA);
            stream.writeVarLong(link.targetB);
            stream.writeByte(link.type);
            stream.writeBoolean(link.immediate);
            stream.writeBoolean(link.passengerInitiated);
            stream.writeFloatLE(link.vehicleAngularVelocity);
        }
    },
    (stream) => {
        const links: ActorLink[] = [];
        for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
            const targetA = stream.readVarLong();
            const targetB = stream.readVarLong();

            const type = stream.readByte();
            if (!isActorLinkType(type)) {
                throw new Error(`Actor link ${targetA} -> ${targetB} carries unknown link type ${type}`);
            }

            links.push({
                targetA,
                targetB,
                type,
                immediate: stream.readBoolean(),
                passengerInitiated: stream.readBoolean(),
                vehicleAngularVelocity: stream.readFloatLE()
            });
        }

        return links;
    }
);

/** `SyncedAttribute[]`: a varuint count, then each attribute's short `AddActor` layout. */
const syncedAttributes = t.custom<Attribute[]>(
    'SyncedAttribute[]',
    (stream, value) => {
        stream.writeUnsignedVarInt(value.length);
        for (const attribute of value) attribute.networkSerializeInitial(stream);
    },
    (stream) => {
        const attributes: Attribute[] = [];
        for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
            attributes.push(Attribute.networkDeserializeInitial(stream));
        }

        return attributes;
    }
);

/** The `AddActorPacket` field list; the module doc carries the wire provenance. */
export const addActorPacket = definePacket('AddActorPacket', {
    /** `Target Actor ID`, ZigZag: the unique id, or the runtime id standing in for it. */
    targetActorId: t.varint64,
    /** `Target Runtime ID`. */
    runtimeEntityId: t.varuint64,
    /** `Actor Type`: the namespaced entity id. */
    type: t.string,
    /** `Position`. */
    position: vector3,
    /** `Velocity`. */
    motion: vector3,
    /** `Rotation` pitch. */
    pitch: t.lf32,
    /** `Rotation` yaw. */
    yaw: t.lf32,
    /** `Y Head Rotation`. */
    headYaw: t.lf32,
    /** `Y Body Rotation`; the server keeps no separate body yaw and writes `yaw` here. */
    bodyYaw: t.lf32,
    /** `Attributes List`, in the short `AddActor` layout. */
    attributes: syncedAttributes,
    /** `Actor Data`. */
    metadata,
    /** `Synched Properties`. */
    syncedProperties,
    /** `Actor Links`. */
    links: actorLinks,
    /** `Passenger Block Data`: the ridden block, or `null` for not riding; 2225 on. */
    passengerOfBlock: gated(SINCE_2225, passengerOfBlock, null)
});

/** What `AddActorPacket` carries, at every version; derived from the field list. */
export type AddActorPayload = PayloadOf<typeof addActorPacket>;
