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

import CommandOriginData from './structures/CommandOriginData';
import { custom } from './fieldTypes';
import { readItemStackDescriptor, writeItemStackDescriptor } from './structures/ItemStackDescriptor';
import { Metadata } from './structures/Metadata';
import { readPassengerOfBlock, writePassengerOfBlock } from './structures/PassengerOfBlock';
import Skin from './structures/skin/Skin';
import { SyncedProperties } from './structures/SyncedProperties';
import UUID from './structures/UUID';

import type { WireType } from './fieldTypes';
import type { ItemStackDescriptorData } from './structures/ItemStackDescriptor';
import type { PassengerOfBlock } from './structures/PassengerOfBlock';
import type { SkinWireLayout } from './structures/skin/Skin';

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
    (stream, value) => writePassengerOfBlock(stream, value),
    (stream) => readPassengerOfBlock(stream)
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
            if (value === null) throw new TypeError('A skin field cannot be written without a skin');
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
