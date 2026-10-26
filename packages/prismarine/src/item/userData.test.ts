/**
 * What a stack puts on the wire past its id, checked as bytes.
 *
 * A malformed user data blob disconnects a real client rather than drawing the item wrong, so
 * the first test pins the whole blob byte for byte against the layout
 * `ItemInstanceUserData` documents. The rest read the blob back through the protocol's own
 * reader, which is the only proof that what was written is what a client parses.
 */
import type { NBTTagCompound } from '@jsprismarine/nbt';
import { ItemInstanceUserData, NetworkBinaryStream } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import { Item } from './Item';
import { itemOfDrop } from '../inventory/persistence';
import { dropOfRolledStack } from './lootStack';

/** The tag type bytes the expected buffer below spells out, as `NBTDefinitions` numbers them. */
const TAG_END = 0x00;
const TAG_INT = 0x03;
const TAG_STRING = 0x08;
const TAG_COMPOUND = 0x0a;

/** A tag name, or a string value: a uint16 little-endian byte count, then UTF-8. */
const text = (value: string): number[] => {
    const utf8 = Buffer.from(value, 'utf-8');
    return [utf8.byteLength & 0xff, utf8.byteLength >> 8, ...utf8];
};

/** `Can Place On` and `Can Destroy`, both empty: a uint32 little-endian zero each. */
const NO_LISTS = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

/** The blob a stack writes, taken off the wire the way a client reads it. */
const userDataOf = (item: Item, { shield = false } = {}): ItemInstanceUserData => {
    const written = new NetworkBinaryStream();
    item.networkSerialize(written, 7);
    const stream = new NetworkBinaryStream(written.getBuffer());

    stream.readShortLE(); // Item id.
    stream.readUnsignedShortLE(); // Count.
    stream.readUnsignedVarInt(); // Aux value.
    expect(stream.readBoolean()).toBe(true);
    stream.readVarInt(); // Stack net id.
    stream.readUnsignedVarInt(); // Block runtime id.

    const blob = new NetworkBinaryStream(Buffer.from(stream.read(stream.readUnsignedVarInt())));
    const data = new ItemInstanceUserData();
    data.deserialize(blob, shield);

    // Nothing may be left over. A blob the reader does not consume whole is a blob whose
    // length the writer got wrong, and every field after it on a real connection is garbage.
    expect(blob.feof()).toBe(true);
    expect(stream.feof()).toBe(true);
    return data;
};

/** The strings of a list tag, which is how `display.Lore` is written. */
const stringsIn = (tag: NBTTagCompound | null, name: string): string[] =>
    [...(tag?.getList(name, false) ?? [])].map((value) => String(value.getValue()));

/** The `ench` list as `{ id, level }` pairs, in the order it was written. */
const enchantmentsIn = (tag: NBTTagCompound | null): { id: number; level: number }[] =>
    [...(tag?.getList('ench', false) ?? [])].map((entry: NBTTagCompound) => ({
        id: entry.getShort('id', 0),
        level: entry.getShort('lvl', 0)
    }));

describe('an item stack on the wire', () => {
    it('writes no compound for a stack with nothing to say', () => {
        expect(new Item({ name: 'minecraft:stone', count: 1 }).userDataTag()).toBeNull();
        expect(userDataOf(new Item({ name: 'minecraft:stone', count: 1 })).userDataTag).toBeNull();
    });

    it('writes a renamed stack as the bytes the protocol lays out', () => {
        const stream = new NetworkBinaryStream();
        const item = new Item({ name: 'minecraft:diamond_sword', count: 1, customName: 'Excalibur' });
        new ItemInstanceUserData(item.userDataTag()).serialize(stream);

        expect(stream.getBuffer()).toEqual(
            Buffer.from([
                0xff,
                0xff, // Marker: int16 LE -1, a compound follows.
                0x01, // User data version.
                TAG_COMPOUND,
                ...text(''), // The root compound is unnamed.
                TAG_INT,
                ...text('Damage'),
                0x00,
                0x00,
                0x00,
                0x00, // A sword wears, so it carries Damage, 0 while unused.
                TAG_COMPOUND,
                ...text('display'),
                TAG_STRING,
                ...text('Name'),
                ...text('Excalibur'),
                TAG_END, // End of display.
                TAG_END, // End of the root compound.
                ...NO_LISTS
            ])
        );
    });

    it('writes the Damage of a worn tool as the bytes BDS sends', () => {
        // A Bedrock Dedicated Server 1.26.52's user data for a wooden pickaxe that had mined
        // three blocks, recorded through the proxy.
        const BDS_WORN_PICKAXE = 'ffff010a000003060044616d61676503000000000000000000000000';
        const pickaxe = new Item({ name: 'minecraft:wooden_pickaxe', count: 1 });
        pickaxe.durability = pickaxe.getMaxDurability() - 3;

        const stream = new NetworkBinaryStream();
        new ItemInstanceUserData(pickaxe.userDataTag()).serialize(stream);

        expect(stream.getBuffer().toString('hex')).toBe(BDS_WORN_PICKAXE);
    });

    it('writes Damage 0 for an unused tool, and nothing for an item that does not wear', () => {
        // BDS sent the unused pickaxe with `Damage` 0 rather than with no compound at all.
        expect(new Item({ name: 'minecraft:wooden_pickaxe', count: 1 }).userDataTag()?.getNumber('Damage', -1)).toBe(0);
        expect(new Item({ name: 'minecraft:dirt', count: 1 }).userDataTag()).toBeNull();
    });

    it('carries the enchantments a Bedrock client has numbers for', () => {
        const item = new Item({ name: 'minecraft:diamond_sword', count: 1 }).withEnchantments({
            'minecraft:sharpness': 3,
            'minecraft:unbreaking': 2
        });

        // Sharpness is EnchantType 9 and Unbreaking is 17.
        expect(enchantmentsIn(userDataOf(item).userDataTag)).toEqual([
            { id: 9, level: 3 },
            { id: 17, level: 2 }
        ]);
    });

    it('carries the name, the lore and the durability spent', () => {
        const item = new Item({ name: 'minecraft:diamond_pickaxe', count: 1 }).withDisplay('Old Reliable', [
            'Mined a lot'
        ]);
        item.durability = item.getMaxDurability() - 42;

        const tag = userDataOf(item).userDataTag;

        expect(tag?.getNumber('Damage', 0)).toBe(42);
        expect(tag?.getCompound('display', false)?.getString('Name', '')).toBe('Old Reliable');
        expect(stringsIn(tag?.getCompound('display', false) ?? null, 'Lore')).toEqual(['Mined a lot']);
    });

    it('draws an enchantment Bedrock has no number for as lore and a glint', () => {
        const item = new Item({ name: 'minecraft:diamond_sword', count: 1 }).withEnchantments({
            'minecraft:sweeping_edge': 2
        });

        const tag = userDataOf(item).userDataTag;

        expect(stringsIn(tag?.getCompound('display', false) ?? null, 'Lore')).toEqual(['Sweeping Edge II']);
        // An id no EnchantType member has: the client shines the item and prints nothing.
        expect(enchantmentsIn(tag)).toEqual([{ id: -1, level: 1 }]);
    });

    it('puts a datapack enchantment above the lore the stack already had', () => {
        const item = new Item({
            name: 'minecraft:diamond_sword',
            count: 1,
            lore: ['Found in a chest']
        }).withEnchantments({ 'example:vampirism': 1, 'minecraft:sharpness': 1 });

        const tag = userDataOf(item).userDataTag;

        expect(stringsIn(tag?.getCompound('display', false) ?? null, 'Lore')).toEqual([
            'Vampirism I',
            'Found in a chest'
        ]);
        // Sharpness already shines, so nothing forces the glint on.
        expect(enchantmentsIn(tag)).toEqual([{ id: 9, level: 1 }]);
    });

    it('lists what a shulker box holds, which is what the client previews', () => {
        const held = new Item({ name: 'minecraft:diamond_sword', count: 1 }).withEnchantments({
            'minecraft:sharpness': 1
        });
        const box = new Item({ name: 'minecraft:shulker_box', count: 1 }).withContents([null, held]);

        const items = [...(userDataOf(box).userDataTag?.getList('Items', false) ?? [])];

        expect(items).toHaveLength(1);
        expect(items[0]?.getString('Name', '')).toBe('minecraft:diamond_sword');
        expect(items[0]?.getByte('Count', 0)).toBe(1);
        // The slot it sat in, not its position in the list: only filled slots go out.
        expect(items[0]?.getByte('Slot', -1)).toBe(1);
        expect(enchantmentsIn(items[0]?.getCompound('tag', false) ?? null)).toEqual([{ id: 9, level: 1 }]);
    });

    it('keeps a shield blocking tick after the compound', () => {
        const item = new Item({ name: 'minecraft:shield', count: 1, customName: 'Wall' });

        expect(userDataOf(item, { shield: true }).blockingTick).toBe(0n);
    });

    it('draws what a loot roll enchanted, all the way from the rolled stack', () => {
        // The three steps a dungeon chest's sword takes: the rolled stack's Java components
        // become a drop, the drop becomes a stack, and the stack goes out. Each step kept
        // less than the one before it until this file and `lootStack.ts` existed.
        const rolled = {
            id: 'minecraft:diamond_sword',
            count: 1,
            components: new Map<string, unknown>([
                ['minecraft:enchantments', { levels: { 'minecraft:sharpness': 4 } }],
                ['minecraft:custom_name', 'Dungeon Blade'],
                ['minecraft:damage', 11]
            ])
        };

        const item = itemOfDrop(dropOfRolledStack(rolled));
        const tag = userDataOf(item!).userDataTag;

        expect(enchantmentsIn(tag)).toEqual([{ id: 9, level: 4 }]);
        expect(tag?.getCompound('display', false)?.getString('Name', '')).toBe('Dungeon Blade');
        expect(tag?.getNumber('Damage', 0)).toBe(11);
    });

    it('writes a bare zero length for an empty slot', () => {
        const written = new NetworkBinaryStream();
        Item.air().networkSerialize(written);
        const stream = new NetworkBinaryStream(written.getBuffer());

        stream.readShortLE();
        stream.readUnsignedShortLE();
        stream.readUnsignedVarInt();
        expect(stream.readBoolean()).toBe(false);
        stream.readUnsignedVarInt();

        expect(stream.readUnsignedVarInt()).toBe(0);
        expect(stream.feof()).toBe(true);
    });
});
