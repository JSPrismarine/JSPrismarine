/**
 * `CreativeContentPacket`: the contents of the creative menu.
 *
 * Two lists, in the order the client renders them. Groups come first: each
 * `CreativeGroupInfoPayload` is a Creative Category byte, a Name string and a Group Icon Item
 * written as an `ItemStack`. Entries follow: each `CreativeItemEntryPayload` is a one-based
 * Creative Net Id varuint32, the Item Instance as an `ItemStack`, and a Group Index varuint32
 * into the groups list.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/creative-content-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { CreativeItemCategory } from '../../packet/CreativeContentPacket';
import type { ItemStackData } from '../../structure/ItemStack';
import type { PayloadOf } from '../define';

/**
 * `ItemStack`: an item without a stack net id, as the creative menu and recipes carry it.
 *
 * The id is a varint32, then the stack size as a little-endian uint16, the aux value as a
 * varuint32, the block runtime id as a varint32 and the user data as a length-prefixed blob. An
 * empty stack (id `0`) writes zero for every field after the id.
 */
const itemStack = t.custom<ItemStackData>(
    'ItemStack',
    (stream, value) => {
        const empty = value.runtimeId === 0;
        t.varint32.write(stream, value.runtimeId);
        t.lu16.write(stream, empty ? 0 : value.count);
        t.varuint32.write(stream, empty ? 0 : value.meta);
        t.varint32.write(stream, empty ? 0 : value.blockRuntimeId);
        stream.writeLengthPrefixed(empty ? Buffer.alloc(0) : (value.userData ?? Buffer.alloc(0)));
    },
    (stream) => ({
        runtimeId: t.varint32.read(stream),
        count: t.lu16.read(stream),
        meta: t.varuint32.read(stream),
        blockRuntimeId: t.varint32.read(stream),
        userData: stream.readLengthPrefixed()
    })
);

/** `CreativeGroupInfoPayload`: one heading of the menu with the item drawn beside it. */
const creativeGroup = t.record({
    /**
     * `Creative Category`: the tab of the menu the group belongs to, numbered 1 through 5 at
     * every protocol version. The 1.26.50 page prints 0 through 4, but the 2193 capture
     * `bedrock-data/src/jsp/v2193/wire/0x91.bin` carries 1 for the construction group
     * `itemGroup.name.planks`.
     */
    category: t.enumOf<CreativeItemCategory>(t.uint8),
    /** `Name`: a translation key such as `itemGroup.name.planks`, or empty for an anonymous group. */
    name: t.string,
    /** `Group Icon Item`: the item drawn beside the heading. */
    icon: itemStack
});

/**
 * `CreativeItemEntryPayload` list: a count, then each entry behind its `Creative Net Id`.
 *
 * The net id is one-based and is the entry's position in the list, so the payload does not
 * hold it: it is written from the index and skipped on read.
 */
const creativeEntries = t.custom<{ item: ItemStackData; group: number }[]>(
    'list<CreativeItemEntryPayload>',
    (stream, entries) => {
        t.varuint32.write(stream, entries.length);
        for (const [index, entry] of entries.entries()) {
            t.varuint32.write(stream, index + 1);
            itemStack.write(stream, entry.item);
            t.varuint32.write(stream, entry.group);
        }
    },
    (stream) => {
        const entries: { item: ItemStackData; group: number }[] = [];
        for (let count = t.varuint32.read(stream); count > 0; count--) {
            t.varuint32.read(stream); // Creative Net Id, which is the entry's position.
            const item = itemStack.read(stream);
            entries.push({ item, group: t.varuint32.read(stream) });
        }
        return entries;
    }
);

/** The fields sent when the creative menu is built for a client. */
export const creativeContentPacket = definePacket('CreativeContentPacket', {
    /** `Groups`: the headings, in the order the client draws them. An entry's group indexes this list. */
    groups: t.list(creativeGroup),
    /** `Entries`: the menu itself, in the order a creative pick is read against. */
    entries: creativeEntries
});

/** Payload carried by `CreativeContentPacket`. */
export type CreativeContentPayload = PayloadOf<typeof creativeContentPacket>;
