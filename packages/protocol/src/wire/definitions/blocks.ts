/**
 * The packets that change one block, or one block actor's data.
 *
 * Layouts follow each packet's docs page at 1.26.51 and are unchanged since protocol 2193.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { ByteOrder, NBTReader, NBTTagCompound, NBTWriter } from '@jsprismarine/nbt';

import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';
import type { WireType } from '../fieldTypes';

/** The same tags under an empty root name, without touching the caller's compound. */
const unnamed = (tags: NBTTagCompound): NBTTagCompound => {
    if (!tags.getName()) return tags;

    const root = new NBTTagCompound('');
    for (const [name, value] of tags.children) root.children.set(name, value);
    return root;
};

/**
 * One network NBT compound: little endian with varint lengths, under an empty root name.
 *
 * The root name is written empty whatever the compound calls itself, because a vanilla
 * compound has no name of its own and one loaded from a world file may carry one.
 */
export const networkNbtCompound: WireType<NBTTagCompound> = t.custom(
    'compound',
    (stream, value) => {
        const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
        writer.setUseVarint(true);
        writer.writeCompound(unnamed(value));
    },
    (stream) => {
        const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
        reader.setUseVarint(true);
        return reader.parse();
    }
);

/** The `UpdateBlockPacket` field list. */
export const updateBlockPacket = definePacket('UpdateBlockPacket', {
    /** `Block Position`: where the block stands. Signed in all three coordinates. */
    position: t.blockPos,
    /** `Block Runtime ID`: the hashed id of the state that now stands there. */
    blockRuntimeId: t.varuint32,
    /** `Flags`: vanilla's `BlockUpdateFlag` bits. */
    flags: t.varuint32,
    /** `Layer`: 0 the block itself, 1 the waterlogging layer. */
    layer: t.varuint32
});

/** What `UpdateBlockPacket` carries. */
export type UpdateBlockPayload = PayloadOf<typeof updateBlockPacket>;

/** The `BlockActorDataPacket` field list. */
export const blockActorDataPacket = definePacket('BlockActorDataPacket', {
    /** `Block Position`: the block the actor sits in. */
    position: t.blockPos,
    /** `Actor Data Tags`: the block actor's complete user data, as network NBT. */
    actorDataTags: networkNbtCompound
});

/** What `BlockActorDataPacket` carries. */
export type BlockActorDataPayload = PayloadOf<typeof blockActorDataPacket>;
