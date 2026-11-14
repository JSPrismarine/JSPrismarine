/**
 * `ItemRegistryPacket`: every item the client may be told about, and the number each travels as.
 *
 * Docs packet 162, sent right after `StartGame`. The payload is the `Item Data` array: a varuint32
 * count, then one `ItemData` per entry. Each entry is `Item Name` (a `hashed_string`, which travels
 * as an ordinary string), `Item Id` (int16 little endian), `Is Component Based` (boolean),
 * `Item Version` (ZigZag varint32, the docs enum `ItemVersion`) and `Item Component Data` (network
 * NBT compound with varint lengths, little endian).
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/item-registry-packet/
 */
import { NBTTagCompound } from '@jsprismarine/nbt';

import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { networkNbtCompound } from '../structureTypes';

import type { PayloadOf } from '../define';

/** One `ItemData` entry of `ItemRegistryPacket`. */
export interface ItemRegistryEntry {
    /** `Item Name`, e.g. `minecraft:stick`. */
    name: string;
    /** `Item Id`, an int16. Negative for a block's item form. */
    runtimeId: number;
    /** `Is Component Based`. True when components define the item instead of client built-ins. */
    componentBased: boolean;
    /** `Item Version` from the docs enum `ItemVersion`: 0 `Legacy`, 1 `DataDriven`, 2 `None`. */
    version: number;
    /**
     * `Item Component Data`, the compound that defines a component-based item. A reader always
     * fills it. A writer may leave it out for an item with no components, which writes the
     * empty compound the field still requires.
     */
    componentData?: NBTTagCompound;
    /** Already encoded network NBT from a captured item table; written byte for byte. */
    componentDataBuffer?: Buffer;
}

/**
 * `ItemData`: one entry, as a single wire type because its last field has two sources.
 *
 * `Item Component Data` is written from `componentDataBuffer` when a captured item table
 * supplies one, from `componentData` otherwise, and as an empty compound when neither is set.
 * The reader always decodes the compound.
 */
const itemData = t.custom<ItemRegistryEntry>(
    'ItemData',
    (stream, value) => {
        t.string.write(stream, value.name);
        t.li16.write(stream, value.runtimeId);
        t.bool.write(stream, value.componentBased);
        t.varint32.write(stream, value.version);
        if (value.componentDataBuffer !== undefined) stream.write(value.componentDataBuffer);
        else networkNbtCompound.write(stream, value.componentData ?? new NBTTagCompound());
    },
    (stream) => ({
        name: t.string.read(stream),
        runtimeId: t.li16.read(stream),
        componentBased: t.bool.read(stream),
        version: t.varint32.read(stream),
        componentData: networkNbtCompound.read(stream)
    })
);

/** The fields sent to declare every item to a client. */
export const itemRegistryPacket = definePacket('ItemRegistryPacket', {
    /** `Item Data`: one entry per item the server declared, in the order the server sent them. */
    items: t.list(itemData)
});

/** Payload carried by `ItemRegistryPacket`. */
export type ItemRegistryPayload = PayloadOf<typeof itemRegistryPacket>;
