/**
 * The client-synchronized property definitions for an actor type. The network-NBT compound
 * carries the actor identifier and its property schema.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/sync-actor-property-packet/}
 */
import { ByteOrder, NBTTagCompound } from '@jsprismarine/nbt';

import { definePacket } from '../define';
import * as t from '../fieldTypes';

/**
 * `Property Data`: one network NBT compound (little-endian, varint lengths), bridged from the
 * hand-written `NBTTagCompound` stream codecs.
 */
const networkNbtCompound = t.custom<NBTTagCompound>(
    'NetworkNbtCompound',
    (s, v) => v.writeToStream(s, ByteOrder.LITTLE_ENDIAN, true),
    (s) => NBTTagCompound.readFromStream(s, ByteOrder.LITTLE_ENDIAN, true)
);

/**
 * The `SyncActorPropertyPacket` field list: the actor properties of one actor type that are
 * flagged for client sync. The compound holds `type`, the actor identifier, and `properties`,
 * the property definitions.
 */
export const syncActorPropertyPacket = definePacket('SyncActorPropertyPacket', {
    /** `Property Data`: the actor type and its synced properties, as network NBT. */
    propertyData: networkNbtCompound
});
