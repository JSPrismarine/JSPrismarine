/**
 * `AddPlayerPacket`: spawns another player's entity on a client, described as a declarative
 * field list.
 *
 * Field names and order follow the docs' packet page. `Passenger Block Data` was inserted at
 * protocol 2225 as an optional `PassengerOfBlockArguments` between the actor links and the
 * device id, so the device id and build platform move one field later. Verified against the
 * v1.26.60 `metadata.zip` (`AddPlayerPacketPayload.json`) and gophertunnel's
 * `AddPlayer.Marshal` at v1.63.0 (`OptionalMarshaler` of `PassengerOfBlock` before
 * `DeviceID`), which agree. Nothing else changed.
 *
 * This definition lives beside the class because its structures (`Item`, `Metadata`, `UUID`)
 * are prismarine-owned; it moves to `@jsprismarine/protocol`'s registry when they do.
 */
import { definePacket, gated, SINCE_2225, t } from '@jsprismarine/protocol';
import { itemStackDescriptor, metadata, passengerOfBlock, syncedProperties, uuid, vec3 } from '../wire/fieldTypes';
import { actorLinks } from './addActor.wire';

import type { PayloadOf } from '@jsprismarine/protocol';

/**
 * One `SerializedLayer` of the abilities data. The layers travel in
 * `UpdateAbilitiesPacket`; this packet usually carries none, but what arrives is kept so the
 * bytes write back out unchanged.
 */
export interface AbilityLayer {
    /** `SerializedLayer`, a little-endian uint16. */
    serializedLayer: number;
    /** `AbilitiesSet`, a little-endian uint32 bitset. */
    abilitiesSet: number;
    /** `AbilityValues`, a little-endian uint32 bitset. */
    abilityValues: number;
    flySpeed: number;
    verticalFlySpeed: number;
    walkSpeed: number;
}

/** The docs' `SerializedAbilitiesData`: the target id, two permission bytes, the layers. */
export interface SerializedAbilitiesData {
    /** `Target Player Raw ID`, a little-endian int64. */
    targetPlayerRawId: bigint;
    /** `Player Permissions`, a signed byte. */
    playerPermission: number;
    /** `Command Permissions`, a byte. */
    commandPermission: number;
    layers: AbilityLayer[];
}

/** `SerializedAbilitiesData` as one named custom type. */
const abilitiesData = t.custom<SerializedAbilitiesData>(
    'SerializedAbilitiesData',
    (stream, value) => {
        stream.writeLongLE(value.targetPlayerRawId);
        stream.writeSignedByte(value.playerPermission);
        stream.writeByte(value.commandPermission);
        stream.writeUnsignedVarInt(value.layers.length);
        for (const layer of value.layers) {
            stream.writeUnsignedShortLE(layer.serializedLayer);
            stream.writeUnsignedIntLE(layer.abilitiesSet);
            stream.writeUnsignedIntLE(layer.abilityValues);
            stream.writeFloatLE(layer.flySpeed);
            stream.writeFloatLE(layer.verticalFlySpeed);
            stream.writeFloatLE(layer.walkSpeed);
        }
    },
    (stream) => {
        const targetPlayerRawId = stream.readLongLE();
        const playerPermission = stream.readSignedByte();
        const commandPermission = stream.readByte();
        const layers: AbilityLayer[] = [];
        for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
            layers.push({
                serializedLayer: stream.readUnsignedShortLE(),
                abilitiesSet: stream.readUnsignedIntLE(),
                abilityValues: stream.readUnsignedIntLE(),
                flySpeed: stream.readFloatLE(),
                verticalFlySpeed: stream.readFloatLE(),
                walkSpeed: stream.readFloatLE()
            });
        }

        return { targetPlayerRawId, playerPermission, commandPermission, layers };
    }
);

/** The `AddPlayerPacket` field list; the module doc carries the wire provenance. */
export const addPlayerPacket = definePacket('AddPlayerPacket', {
    /** `UUID`. */
    uuid,
    /** `Player Name`. */
    name: t.string,
    /** `Target Runtime ID`. */
    runtimeEntityId: t.varuint64,
    /** `Platform Chat Id`. */
    platformChatId: t.string,
    /** `Position`. */
    position: vec3,
    /** `Velocity`. */
    motion: vec3,
    /** `Rotation` pitch. */
    pitch: t.lf32,
    /** `Rotation` yaw. */
    yaw: t.lf32,
    /** `Y-Head Rotation`. */
    headYaw: t.lf32,
    /** `Carried Item`. */
    carriedItem: itemStackDescriptor,
    /** `Player Game Type`, a `Gametype` value. */
    gamemode: t.varint32,
    /** `Entity Data`. */
    metadata,
    /** `Synched Properties`. */
    syncedProperties,
    /** `Abilities Data`. */
    abilities: abilitiesData,
    /** `Actor Links`. */
    links: actorLinks,
    /** `Passenger Block Data`: the ridden block, or `null` for not riding; 2225 on. */
    passengerOfBlock: gated(SINCE_2225, passengerOfBlock, null),
    /** `Device Id`. */
    deviceId: t.string,
    /** `Build Platform`, a `BuildPlatform` value as a little-endian int32. */
    buildPlatform: t.li32
});

/** What `AddPlayerPacket` carries, at every version; derived from the field list. */
export type AddPlayerPayload = PayloadOf<typeof addPlayerPacket>;
