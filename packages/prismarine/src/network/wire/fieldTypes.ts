/**
 * Wire types over prismarine-owned structures, for the declarative definitions that live in
 * this package.
 *
 * Each wraps an existing hand-written serializer pair as one named `t.custom` wire type, the
 * ADR's escape hatch for a body that resists flat description. A type graduates to
 * `@jsprismarine/protocol`'s `fieldTypes` when the structure it carries does.
 *
 * @see `docs/adr/0003-declarative-wire-layouts.md`
 */
import { t } from '@jsprismarine/protocol';
import { Vector3 } from '@jsprismarine/math';
import { Metadata } from '../../entity/Metadata';
import { Item } from '../../item/Item';
import UUID from '../../utils/UUID';
import Skin from '../../utils/skin/Skin';
import { readPassengerOfBlock, writePassengerOfBlock } from '../type/PassengerOfBlock';
import { SyncedProperties } from '../type/SyncedProperties';

import type { PassengerOfBlock } from '../type/PassengerOfBlock';
import type { SkinWireLayout } from '../../utils/skin/Skin';

/** One value's wire representation, as the protocol package's vocabulary defines it. */
type WireType<T> = t.WireType<T>;

/** `mce::UUID`: two 64-bit halves, little endian, most significant first. */
export const uuid: WireType<UUID> = t.custom(
    'mce::UUID',
    (stream, value) => value.networkSerialize(stream),
    (stream) => UUID.networkDeserialize(stream)
);

/** `Vec3`: three little-endian floats, carried as a math `Vector3`. */
export const vec3: WireType<Vector3> = t.custom(
    'Vec3',
    (stream, value) => {
        stream.writeFloatLE(value.getX());
        stream.writeFloatLE(value.getY());
        stream.writeFloatLE(value.getZ());
    },
    (stream) => new Vector3(stream.readFloatLE(), stream.readFloatLE(), stream.readFloatLE())
);

/** `SynchedActorDataList`: the entity metadata, as `Metadata` reads and writes it. */
export const metadata: WireType<Metadata> = t.custom(
    'SynchedActorDataList',
    (stream, value) => value.networkSerialize(stream),
    (stream) => {
        const read = new Metadata(false);
        read.networkDeserialize(stream);
        return read;
    }
);

/** `PropertySyncData`: the client-synced entity property values, two counted lists. */
export const syncedProperties: WireType<SyncedProperties> = t.custom(
    'PropertySyncData',
    (stream, value) => value.networkSerialize(stream),
    (stream) => SyncedProperties.networkDeserialize(stream)
);

/** `NetworkItemStackDescriptor`: one item stack in the tracked form, without a stack net id. */
export const itemStackDescriptor: WireType<Item> = t.custom(
    'NetworkItemStackDescriptor',
    (stream, value) => value.networkSerialize(stream),
    (stream) => Item.networkDeserialize(stream)
);

/**
 * An optional `PassengerOfBlockArguments`, new at protocol 2225: one presence byte, then the
 * ridden block's five fields. `null` is not riding.
 */
export const passengerOfBlock: WireType<PassengerOfBlock | null> = t.custom(
    'optional<PassengerOfBlockArguments>',
    (stream, value) => writePassengerOfBlock(stream, value),
    (stream) => readPassengerOfBlock(stream)
);

/**
 * `SerializedSkin` under one of its two layouts: the 2193 one carries the PlayFab id inside
 * the skin, the 2225 one leaves it to the enclosing structure. The layout is a parameter
 * here and a version gate in the field lists that reference this.
 */
export const serializedSkin = (layout: SkinWireLayout): WireType<Skin | null> =>
    t.custom(
        layout.carriesPlayFabId ? 'SerializedSkin' : 'SerializedSkin[no PlayFabId]',
        (stream, value) => {
            if (value === null) throw new TypeError('A skin field cannot be written without a skin');
            value.networkSerialize(stream, layout);
        },
        (stream) => Skin.networkDeserialize(stream, layout)
    );
