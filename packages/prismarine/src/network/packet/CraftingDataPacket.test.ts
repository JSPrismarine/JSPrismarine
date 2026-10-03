import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { FurnaceRecipe, ShapedRecipe, ShapelessRecipe, SmithingRecipe } from '../../crafting/Recipe';
import { ANY_META, ItemIngredient } from '../../crafting/RecipeIngredient';
import { Item } from '../../item/Item';
import UUID from '../../utils/UUID';
import { NetworkUtil } from '../NetworkUtil';
import { readRecipeIngredient } from '../type/RecipeIngredientCodec';
import CraftingDataPacket from './CraftingDataPacket';

const item = (name: string) => new Item({ id: 1, name });
const need = (name: string, meta?: number) => new ItemIngredient(name, meta);

/**
 * The ten recipe lists, in the order the packet writes them. A recipe's *list* is its type
 * now - there is no type id in front of an entry any more - so a test reads to the list it
 * cares about by counting the empty ones before it.
 */
const LISTS = [
    'shaped',
    'shapeless',
    'multi',
    'shulkerBox',
    'shapelessChemistry',
    'shapedChemistry',
    'smithingTransform',
    'smithingTrim',
    'potion',
    'potionContainer'
] as const;

/** Encodes one recipe and hands back a reader positioned at the start of the given list. */
const encoded = (recipe: any, list: (typeof LISTS)[number], netId = 7) => {
    const packet = new CraftingDataPacket();
    packet.recipes = [recipe];
    packet.netIdOf = () => netId;
    packet.encode();

    const stream = new BinaryStream(packet.getBuffer());
    stream.readUnsignedVarInt(); // Packet header.

    // Everything before this recipe's list is empty, so each is a single zero to step over.
    for (let i = 0; i < LISTS.indexOf(list); i++) {
        expect(stream.readUnsignedVarInt()).toBe(0);
    }

    expect(stream.readUnsignedVarInt()).toBe(1); // The one recipe, in its own list.

    return stream;
};

/** Reads back what the tail of a shapeless or shaped recipe writes. */
const readTail = (stream: BinaryStream) => {
    const uuid = UUID.networkDeserialize(stream);
    const block = NetworkUtil.readString(stream);
    const priority = stream.readVarInt();

    return { uuid, block, priority };
};

/** Reads the optional unlocking requirement that follows a shaped or shapeless recipe. */
const readUnlockRequirement = (stream: BinaryStream) => {
    const present = stream.readBoolean();
    if (!present) return { present, context: null };

    const context = stream.readVarInt();
    stream.readBoolean(); // Set only when the context is `NONE`, which is when a list follows.

    return { present, context };
};

describe('network', () => {
    describe('CraftingDataPacket', () => {
        it('writes ten empty lists and the flag when it has nothing to say', () => {
            // Absent, they do not save ten bytes - they misalign everything after them, and
            // what follows an empty list here is another list.
            const packet = new CraftingDataPacket();
            packet.recipes = [];
            packet.encode();

            const stream = new BinaryStream(packet.getBuffer());
            stream.readUnsignedVarInt(); // Header.

            for (const _list of LISTS) expect(stream.readUnsignedVarInt()).toBe(0);
            expect(stream.readUnsignedVarInt()).toBe(0); // Material reducers.
            expect(stream.readBoolean()).toBe(true); // Clean recipes.
            expect(stream.feof()).toBe(true);
        });

        it('writes a shapeless recipe the way it reads back', () => {
            const recipe = new ShapelessRecipe(
                'torch',
                'crafting_table',
                [need('minecraft:stick'), need('minecraft:coal')],
                [item('minecraft:torch')],
                3
            );

            const stream = encoded(recipe, 'shapeless');

            expect(NetworkUtil.readString(stream)).toBe('torch');

            expect(stream.readUnsignedVarInt()).toBe(2);
            expect(readRecipeIngredient(stream).descriptor).toEqual({
                kind: 'name',
                name: 'minecraft:stick',
                meta: ANY_META
            });
            expect(readRecipeIngredient(stream).descriptor).toEqual({
                kind: 'name',
                name: 'minecraft:coal',
                meta: ANY_META
            });

            expect(stream.readUnsignedVarInt()).toBe(1);
            Item.networkDeserializeWithoutStackId(stream);

            const tail = readTail(stream);
            expect(tail.block).toBe('crafting_table');
            expect(tail.priority).toBe(3);

            // Always unlocked, so no list of unlocking ingredients follows.
            expect(readUnlockRequirement(stream).context).toBe(1);
            expect(stream.readUnsignedVarInt()).toBe(7); // Recipe net id.
        });

        it('writes a shaped recipe, holes included', () => {
            // An empty slot is an ingredient of no kind on the wire, not one that was
            // skipped - skipping it would shorten the recipe and misalign the next.
            const recipe = new ShapedRecipe(
                'hoe',
                'crafting_table',
                2,
                2,
                [need('minecraft:stick'), need('minecraft:stick'), need('minecraft:coal'), null],
                [item('minecraft:wooden_hoe')],
                0,
                true
            );

            const stream = encoded(recipe, 'shaped');

            expect(NetworkUtil.readString(stream)).toBe('hoe');
            expect(stream.readVarInt()).toBe(2); // Width.
            expect(stream.readVarInt()).toBe(2); // Height.

            // Counted now, and the client rejects a count that is not width times height.
            expect(stream.readUnsignedVarInt()).toBe(4);

            const slots = [0, 1, 2, 3].map(() => readRecipeIngredient(stream));
            expect(slots.filter((slot) => slot.descriptor === null)).toHaveLength(1);

            expect(stream.readUnsignedVarInt()).toBe(1);
            Item.networkDeserializeWithoutStackId(stream);

            readTail(stream);
            expect(stream.readBoolean()).toBe(true); // Symmetric, which only shaped writes.
            expect(readUnlockRequirement(stream).present).toBe(true);
            expect(stream.readUnsignedVarInt()).toBe(7);
            expect(stream.feof()).toBe(false); // The lists after this one still follow.
        });

        /**
         * There is no list for them any more. The format lost its furnace entries at 2168 -
         * smelting is data driven on the client now - and putting one in any of the nine
         * remaining lists would have the client read a furnace recipe as some other shape.
         */
        it('drops a furnace recipe rather than filing it under another shape', () => {
            const recipe = new FurnaceRecipe('smelt', 'furnace', need('minecraft:stone'), item('minecraft:stone'));

            const packet = new CraftingDataPacket();
            packet.recipes = [recipe];
            packet.encode();

            const stream = new BinaryStream(packet.getBuffer());
            stream.readUnsignedVarInt(); // Header.

            for (const _list of LISTS) expect(stream.readUnsignedVarInt()).toBe(0);
            expect(stream.readUnsignedVarInt()).toBe(0); // Material reducers.
            expect(stream.readBoolean()).toBe(true);
            expect(stream.feof()).toBe(true);
        });

        it('writes a smithing recipe as three ingredients in order', () => {
            const recipe = new SmithingRecipe(
                'upgrade',
                'smithing_table',
                need('minecraft:template'),
                need('minecraft:diamond_axe'),
                need('minecraft:netherite_ingot'),
                item('minecraft:netherite_axe')
            );

            const stream = encoded(recipe, 'smithingTransform');

            expect(NetworkUtil.readString(stream)).toBe('upgrade');
            expect(readRecipeIngredient(stream).descriptor).toMatchObject({ name: 'minecraft:template' });
            expect(readRecipeIngredient(stream).descriptor).toMatchObject({ name: 'minecraft:diamond_axe' });
            expect(readRecipeIngredient(stream).descriptor).toMatchObject({ name: 'minecraft:netherite_ingot' });

            Item.networkDeserializeWithoutStackId(stream);
            expect(NetworkUtil.readString(stream)).toBe('smithing_table');
            expect(stream.readUnsignedVarInt()).toBe(7);
        });

        it('keeps each shape in its own list', () => {
            const packet = new CraftingDataPacket();
            packet.recipes = [
                new ShapelessRecipe('torch', 'crafting_table', [need('minecraft:stick')], [item('minecraft:torch')], 0),
                new ShapedRecipe(
                    'hoe',
                    'crafting_table',
                    1,
                    1,
                    [need('minecraft:stick')],
                    [item('minecraft:wooden_hoe')],
                    0,
                    true
                )
            ];
            packet.encode();

            const stream = new BinaryStream(packet.getBuffer());
            stream.readUnsignedVarInt(); // Header.

            // Shaped comes first, and the shapeless recipe is not in with it.
            expect(stream.readUnsignedVarInt()).toBe(1);
        });

        it('gives a recipe the same uuid every time', () => {
            // The client keys its book on these: a fresh set each start is a book that resets.
            expect(CraftingDataPacket.uuidFor('torch')).toEqual(CraftingDataPacket.uuidFor('torch'));
            expect(CraftingDataPacket.uuidFor('torch')).not.toEqual(CraftingDataPacket.uuidFor('stick'));
            expect(CraftingDataPacket.uuidFor('torch')).toHaveLength(16);
        });

        it('refuses a recipe it has no shape for, rather than writing a short one', () => {
            const odd = {
                id: 'x',
                station: 'crafting_table',
                priority: 0,
                getIngredients: () => [],
                getOutputs: () => [],
                matches: () => false
            };
            const packet = new CraftingDataPacket();
            packet.recipes = [odd as any];

            expect(() => packet.encode()).toThrow(/cannot write/);
        });
    });
});
