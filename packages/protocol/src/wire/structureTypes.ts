/**
 * Wire types over the structures this package keeps as hand-written serializer pairs.
 *
 * Each wraps one such pair as a named `custom` wire type, the ADR's escape hatch for a body
 * that resists flat description. They sit beside `fieldTypes.ts` rather than inside it because
 * a primitive has no dependencies and these carry a structure each.
 *
 * @see `docs/adr/0003-declarative-wire-layouts.md`
 */
import { Vector3 } from '@jsprismarine/math';
import { ByteOrder, NBTTagCompound } from '@jsprismarine/nbt';

import BlockPos from '../structure/BlockPos';
import Vec2 from '../structure/Vec2';
import Vec3 from '../structure/Vec3';

import CommandOriginData from './structures/CommandOriginData';
import { versioned } from './define';
import { custom } from './fieldTypes';
import { readItemStackDescriptor, writeItemStackDescriptor } from './structures/ItemStackDescriptor';
import { Metadata } from './structures/Metadata';
import {
    PASSENGER_OF_BLOCK_2225,
    PASSENGER_OF_BLOCK_2259,
    readPassengerOfBlock,
    writePassengerOfBlock
} from './structures/PassengerOfBlock';
import Skin from './structures/skin/Skin';
import { SyncedProperties } from './structures/SyncedProperties';
import UUID from './structures/UUID';

import { SINCE_2259, UNTIL_2225, UNTIL_2259 } from './wireGates';

import type { WireType } from './fieldTypes';
import type { ItemStackDescriptorData } from './structures/ItemStackDescriptor';
import type { PassengerOfBlock } from './structures/PassengerOfBlock';
import type { SkinWireLayout } from './structures/skin/Skin';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

/** `mce::UUID`: two 64-bit halves, little endian, most significant first. */
export const uuid: WireType<UUID> = custom(
    'mce::UUID',
    (stream, value) => value.networkSerialize(stream),
    (stream) => UUID.networkDeserialize(stream)
);

/**
 * `Vec3` as a math `Vector3`: three little-endian floats.
 *
 * The same three bytes-wise as `t.vec3`, which hands back a plain `{ x, y, z }`. Packets whose
 * positions are `Vector3` all the way through use this one so nothing converts at the boundary.
 */
export const vector3: WireType<Vector3> = custom(
    'Vec3',
    (stream, value) => {
        stream.writeFloatLE(value.getX());
        stream.writeFloatLE(value.getY());
        stream.writeFloatLE(value.getZ());
    },
    (stream) => new Vector3(stream.readFloatLE(), stream.readFloatLE(), stream.readFloatLE())
);

/** `NetworkItemStackDescriptor`: one item stack, as the six fields on the wire. */
export const itemStackDescriptor: WireType<ItemStackDescriptorData> = custom(
    'NetworkItemStackDescriptor',
    writeItemStackDescriptor,
    readItemStackDescriptor
);

/** `SynchedActorDataList`: the entity metadata, as `Metadata` reads and writes it. */
export const metadata: WireType<Metadata> = custom(
    'SynchedActorDataList',
    (stream, value) => value.networkSerialize(stream),
    (stream) => {
        const read = new Metadata(false);
        read.networkDeserialize(stream);
        return read;
    }
);

/** `PropertySyncData`: the client-synced entity property values, two counted lists. */
export const syncedProperties: WireType<SyncedProperties> = custom(
    'PropertySyncData',
    (stream, value) => value.networkSerialize(stream),
    (stream) => SyncedProperties.networkDeserialize(stream)
);

/**
 * An optional `PassengerOfBlockArguments`, new at protocol 2225: one presence byte, then the
 * ridden block's five fields. `null` is not riding.
 */
export const passengerOfBlock: WireType<PassengerOfBlock | null> = custom(
    'optional<PassengerOfBlockArguments>',
    (stream, value) => writePassengerOfBlock(stream, value, PASSENGER_OF_BLOCK_2225),
    (stream) => readPassengerOfBlock(stream, PASSENGER_OF_BLOCK_2225)
);

/** {@link passengerOfBlock} from protocol 2259, with `BlockType` and `PackUUID` appended. */
export const passengerOfBlock2259: WireType<PassengerOfBlock | null> = custom(
    'optional<PassengerOfBlockArguments[2259]>',
    (stream, value) => writePassengerOfBlock(stream, value, PASSENGER_OF_BLOCK_2259),
    (stream) => readPassengerOfBlock(stream, PASSENGER_OF_BLOCK_2259)
);

/**
 * The passenger field of `AddActorPacket` and `AddPlayerPacket`: off the wire before 2225, where
 * it reads as `null` and a value is dropped, then in the 2225 layout, then in the 2259 one.
 */
export const passengerOfBlockField = versioned<PassengerOfBlock | null>(
    [
        UNTIL_2225,
        custom(
            'absent<PassengerOfBlockArguments>',
            () => undefined,
            () => null
        )
    ],
    [UNTIL_2259, passengerOfBlock],
    [SINCE_2259, passengerOfBlock2259]
);

/**
 * `SerializedSkin` under one of its two layouts: the 2193 one carries the PlayFab id inside
 * the skin, the 2225 one leaves it to the enclosing structure. The layout is a parameter
 * here and a version gate in the field lists that reference this.
 * @param layout - Which of the two `SerializedSkin` layouts to read and write.
 * @returns The wire type for a skin in that layout.
 */
export const serializedSkin = (layout: SkinWireLayout): WireType<Skin | null> =>
    custom(
        layout.carriesPlayFabId ? 'SerializedSkin' : 'SerializedSkin[no PlayFabId]',
        (stream, value) => {
            if (value === null) throw new ProtocolWireErrors.MissingSkin();
            value.networkSerialize(stream, layout);
        },
        (stream) => Skin.networkDeserialize(stream, layout)
    );

/** `CommandOriginData`: who or what ran a command, as the four fields on the wire. */
export const commandOriginData: WireType<CommandOriginData> = custom(
    'CommandOriginData',
    (stream, value) => value.networkSerialize(stream),
    (stream) => CommandOriginData.networkDeserialize(stream)
);

/** `Vec2` as the {@link Vec2} structure class: two little-endian floats, x then y. */
export const vec2Structure: WireType<Vec2> = custom(
    'Vec2',
    (stream, value) => value.serialize(stream),
    (stream) => {
        const vector = new Vec2(0, 0);
        vector.deserialize(stream);
        return vector;
    }
);

/** `Vec3` as the {@link Vec3} structure class: three little-endian floats. */
export const vec3Structure: WireType<Vec3> = custom(
    'Vec3',
    (stream, value) => value.serialize(stream),
    (stream) => {
        const vector = new Vec3(0, 0, 0);
        vector.deserialize(stream);
        return vector;
    }
);

/**
 * `BlockPos` as the {@link BlockPos} structure class: three ZigZag varints. The same bytes as
 * `t.blockPos`, which hands back a plain `{ x, y, z }`.
 */
export const blockPosStructure: WireType<BlockPos> = custom(
    'BlockPos',
    (stream, value) => value.serialize(stream),
    (stream) => {
        const position = new BlockPos(0, 0, 0);
        position.deserialize(stream);
        return position;
    }
);

/** A network NBT compound: little endian with varint lengths. */
export const networkNbtCompound: WireType<NBTTagCompound> = custom(
    'NetworkNbtCompound',
    (stream, value) => value.writeToStream(stream, ByteOrder.LITTLE_ENDIAN, true),
    (stream) => NBTTagCompound.readFromStream(stream, ByteOrder.LITTLE_ENDIAN, true)
);
