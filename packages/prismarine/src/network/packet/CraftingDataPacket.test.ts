import crypto from 'node:crypto';

import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import type { Recipe } from '../../crafting/Recipe';
import { FurnaceRecipe, ShapedRecipe, ShapelessRecipe, SmithingRecipe } from '../../crafting/Recipe';
import { ANY_META, ItemIngredient, TagIngredient } from '../../crafting/RecipeIngredient';
import { Item } from '../../item/Item';
import UUID from '../../utils/UUID';
import { NetworkUtil } from '../NetworkUtil';
import { readRecipeIngredient } from '../type/RecipeIngredientCodec';
import CraftingDataPacket from './CraftingDataPacket';

const item = (name: string) => new Item({ runtimeId: 1, name });
const need = (name: string, meta?: number) => new ItemIngredient(name, meta);

/**
 * A name that is in neither the item table nor the block table, so the stack it is put in
 * encodes to bytes this file can spell out without consulting either.
 */
const OUTPUT_NAME = 'jsprismarine:test_output';
const OUTPUT_ID = 7;

/** LEB128, which is what the docs call a varuint. */
const varuint = (value: number): number[] => {
    const bytes: number[] = [];
    let rest = value >>> 0;

    do {
        const byte = rest & 0x7f;
        rest >>>= 7;
        bytes.push(rest > 0 ? byte | 0x80 : byte);
    } while (rest > 0);

    return bytes;
};

/** ZigZag then LEB128, which is what the docs call a varint32. */
const varint = (value: number): number[] => varuint((value << 1) ^ (value >> 31));

/** A varuint byte length followed by the UTF-8 bytes. */
const text = (value: string): number[] => {
    const bytes = Buffer.from(value, 'utf8');

    return [...varuint(bytes.byteLength), ...bytes];
};

/** An `mce::UUID`: the two halves of the digest, each as a little endian uint64. */
const uuidBytes = (id: string): number[] => {
    const digest = crypto.createHash('md5').update(id).digest();

    return [...Buffer.from(digest.subarray(0, 8)).reverse(), ...Buffer.from(digest.subarray(8, 16)).reverse()];
};

/**
 * One `NetworkItemInstanceDescriptor` holding a single {@link OUTPUT_NAME}.
 *
 * Id, Stack size, Aux value, Block Runtime Id, then the User Data Buffer: a length and, inside
 * it, an empty nbt length and the two empty can-place-on / can-break lists.
 */
const OUTPUT_STACK = [
    ...varint(OUTPUT_ID),
    1,
    0,
    ...varuint(0),
    ...varint(0),
    ...varuint(10),
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
];

/**
 * One `RecipeIngredient` naming an item, in the legacy form `CraftingDataPacket` uses: the
 * variant selector, the descriptor's shape as a string, Full Name, Aux Value, then the count.
 */
const namedIngredient = (name: string, meta: number, count: number): number[] => [
    ...varuint(1),
    ...text('name'),
    ...text(name),
    ...varint(meta),
    ...varint(count)
];

/**
 * One `RecipeIngredient` naming a tag: the same `DEFAULT` selector, `item_tag` as the shape,
 * the tag, then the wildcard aux a tag always carries, and the count.
 */
const tagIngredient = (tag: string, count: number): number[] => [
    ...varuint(1),
    ...text('item_tag'),
    ...text(tag),
    ...varint(ANY_META),
    ...varint(count)
];

/** The empty slot of a shaped pattern: the invalid selector, the wildcard aux, and no count. */
const emptyIngredient = (): number[] => [...varuint(0), ...varint(ANY_META), ...varint(0)];

/** The optional unlocking requirement this server writes: present, always unlocked, no list. */
const ALWAYS_UNLOCKED = [1, ...varint(1), 0];

/**
 * The ten recipe lists, in the order the packet writes them. A recipe's *list* is its type
 * now - there is no type id in front of an entry any more - so a test reads to the list it
 * cares about by counting the empty ones before it.
 */
const LISTS = [
    'shaped',
    'shapeless',
    'multi',
    'userDataShapeless',
    'shapelessChemistry',
    'shapedChemistry',
    'smithingTransform',
    'smithingTrim',
    'potionMixes',
    'containerMixes'
] as const;

/** Encodes one recipe and hands back a reader positioned at the start of the given list. */
const encoded = (recipe: Recipe, list: (typeof LISTS)[number], netId = 7) => {
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

        it('writes a shapeless recipe as the exact bytes the docs give', () => {
            // Spelled out rather than read back through the same codec, which would agree with
            // itself whatever it wrote. The ingredient is the part this pins down: the client
            // reads a varuint selector, a string naming the descriptor's shape, the item's
            // name, a varint aux value and a varint count - not the uint8 descriptor type and
            // uint16 stack size that the docs' `recipe-ingredient` page describes, which is the
            // form the auto-craft action inside an `ItemStackRequest` uses instead.
            const packet = new CraftingDataPacket();
            packet.recipes = [
                new ShapelessRecipe(
                    'torch',
                    'crafting_table',
                    [need('minecraft:stick')],
                    [new Item({ runtimeId: OUTPUT_ID, name: OUTPUT_NAME })],
                    3
                )
            ];
            packet.netIdOf = () => 7;
            packet.encode();

            expect([...packet.getBuffer()]).toEqual([
                ...varuint(CraftingDataPacket.NetID),
                ...varuint(0), // Shaped Recipes.
                ...varuint(1), // Shapeless Recipes.
                ...text('torch'), // Recipe Id.
                ...varuint(1), // Ingredients.
                ...namedIngredient('minecraft:stick', ANY_META, 1),
                ...varuint(1), // Results.
                ...OUTPUT_STACK,
                ...uuidBytes('torch'), // UUID.
                ...text('crafting_table'), // Tag.
                ...varint(3), // Priority.
                ...ALWAYS_UNLOCKED, // Unlocking Requirement.
                ...varuint(7), // Net Id.
                ...varuint(0), // Multi Recipes.
                ...varuint(0), // User Data Shapeless Recipes.
                ...varuint(0), // Shapeless Chemistry Recipes.
                ...varuint(0), // Shaped Chemistry Recipes.
                ...varuint(0), // Smithing Transform Recipes.
                ...varuint(0), // Smithing Trim Recipes.
                ...varuint(0), // Potion Mixes.
                ...varuint(0), // Container Mixes.
                ...varuint(0), // Material Reducers.
                1 // Clear Recipes.
            ]);
        });

        it('writes a shaped recipe as the exact bytes the docs give', () => {
            // Width and Height come before the Ingredients, the count of which the client
            // checks against their product, and Assume Symmetry sits between Priority and the
            // unlocking requirement - which is the one field that tells the two shapes apart
            // past the ingredients.
            const packet = new CraftingDataPacket();
            packet.recipes = [
                new ShapedRecipe(
                    'hoe',
                    'crafting_table',
                    2,
                    1,
                    [need('minecraft:stick'), null],
                    [new Item({ runtimeId: OUTPUT_ID, name: OUTPUT_NAME })],
                    0,
                    true
                )
            ];
            packet.netIdOf = () => 7;
            packet.encode();

            expect([...packet.getBuffer()]).toEqual([
                ...varuint(CraftingDataPacket.NetID),
                ...varuint(1), // Shaped Recipes.
                ...text('hoe'), // Recipe Id.
                ...varint(2), // Width.
                ...varint(1), // Height.
                ...varuint(2), // Ingredients, which must be Width times Height.
                ...namedIngredient('minecraft:stick', ANY_META, 1),
                ...emptyIngredient(),
                ...varuint(1), // Results.
                ...OUTPUT_STACK,
                ...uuidBytes('hoe'), // UUID.
                ...text('crafting_table'), // Tag.
                ...varint(0), // Priority.
                1, // Assume Symmetry.
                ...ALWAYS_UNLOCKED, // Unlocking Requirement.
                ...varuint(7), // Net Id.
                ...varuint(0), // Shapeless Recipes.
                ...varuint(0), // Multi Recipes.
                ...varuint(0), // User Data Shapeless Recipes.
                ...varuint(0), // Shapeless Chemistry Recipes.
                ...varuint(0), // Shaped Chemistry Recipes.
                ...varuint(0), // Smithing Transform Recipes.
                ...varuint(0), // Smithing Trim Recipes.
                ...varuint(0), // Potion Mixes.
                ...varuint(0), // Container Mixes.
                ...varuint(0), // Material Reducers.
                1 // Clear Recipes.
            ]);
        });

        it('writes a smithing transform recipe as the exact bytes the docs give', () => {
            // Recipe Id, then Template, Base and Addition as three bare ingredients - no count
            // in front of them - then one Result rather than a list, the Tag, and the Net Id.
            // No UUID, no Priority, no unlocking requirement: those belong to the two grid
            // shapes only.
            const packet = new CraftingDataPacket();
            packet.recipes = [
                new SmithingRecipe(
                    'upgrade',
                    'smithing_table',
                    need('minecraft:netherite_upgrade_smithing_template'),
                    need('minecraft:diamond_axe'),
                    need('minecraft:netherite_ingot'),
                    new Item({ runtimeId: OUTPUT_ID, name: OUTPUT_NAME })
                )
            ];
            packet.netIdOf = () => 7;
            packet.encode();

            expect([...packet.getBuffer()]).toEqual([
                ...varuint(CraftingDataPacket.NetID),
                ...varuint(0), // Shaped Recipes.
                ...varuint(0), // Shapeless Recipes.
                ...varuint(0), // Multi Recipes.
                ...varuint(0), // User Data Shapeless Recipes.
                ...varuint(0), // Shapeless Chemistry Recipes.
                ...varuint(0), // Shaped Chemistry Recipes.
                ...varuint(1), // Smithing Transform Recipes.
                ...text('upgrade'), // Recipe Id.
                ...namedIngredient('minecraft:netherite_upgrade_smithing_template', ANY_META, 1), // Template.
                ...namedIngredient('minecraft:diamond_axe', ANY_META, 1), // Base.
                ...namedIngredient('minecraft:netherite_ingot', ANY_META, 1), // Addition.
                ...OUTPUT_STACK, // Result.
                ...text('smithing_table'), // Tag.
                ...varuint(7), // Net Id.
                ...varuint(0), // Smithing Trim Recipes.
                ...varuint(0), // Potion Mixes.
                ...varuint(0), // Container Mixes.
                ...varuint(0), // Material Reducers.
                1 // Clear Recipes.
            ]);
        });

        it('writes a tag ingredient under item_tag with the wildcard aux', () => {
            // A tag names no single item, so the aux that follows it is the wildcard - the
            // same 32767 an empty slot carries - and the count still closes the ingredient.
            const packet = new CraftingDataPacket();
            packet.recipes = [
                new ShapelessRecipe(
                    'sticks',
                    'crafting_table',
                    [new TagIngredient('minecraft:planks', new Set(['minecraft:oak_planks']), 2)],
                    [new Item({ runtimeId: OUTPUT_ID, name: OUTPUT_NAME })]
                )
            ];
            packet.netIdOf = () => 7;
            packet.encode();

            expect([...packet.getBuffer()]).toEqual([
                ...varuint(CraftingDataPacket.NetID),
                ...varuint(0), // Shaped Recipes.
                ...varuint(1), // Shapeless Recipes.
                ...text('sticks'), // Recipe Id.
                ...varuint(1), // Ingredients.
                ...tagIngredient('minecraft:planks', 2),
                ...varuint(1), // Results.
                ...OUTPUT_STACK,
                ...uuidBytes('sticks'), // UUID.
                ...text('crafting_table'), // Tag.
                ...varint(0), // Priority.
                ...ALWAYS_UNLOCKED, // Unlocking Requirement.
                ...varuint(7), // Net Id.
                ...varuint(0), // Multi Recipes.
                ...varuint(0), // User Data Shapeless Recipes.
                ...varuint(0), // Shapeless Chemistry Recipes.
                ...varuint(0), // Shaped Chemistry Recipes.
                ...varuint(0), // Smithing Transform Recipes.
                ...varuint(0), // Smithing Trim Recipes.
                ...varuint(0), // Potion Mixes.
                ...varuint(0), // Container Mixes.
                ...varuint(0), // Material Reducers.
                1 // Clear Recipes.
            ]);
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

        it('numbers recipes from one when no caller says otherwise', () => {
            // Zero is not a net id, and two recipes may not share one - so the fallback is a
            // recipe's one-based position, whatever list it ends up written in.
            const shapeless = new ShapelessRecipe(
                'torch',
                'crafting_table',
                [need('minecraft:stick')],
                [item('minecraft:torch')],
                0
            );
            const shaped = new ShapedRecipe(
                'hoe',
                'crafting_table',
                1,
                1,
                [need('minecraft:stick')],
                [item('minecraft:wooden_hoe')],
                0,
                true
            );
            const packet = new CraftingDataPacket();
            packet.recipes = [shapeless, shaped];

            expect(packet.netIdOf(shapeless)).toBe(1);
            expect(packet.netIdOf(shaped)).toBe(2);
        });

        it('gives a recipe the same uuid every time', () => {
            // The client keys its book on these: a fresh set each start is a book that resets.
            expect(CraftingDataPacket.uuidFor('torch')).toEqual(CraftingDataPacket.uuidFor('torch'));
            expect(CraftingDataPacket.uuidFor('torch')).not.toEqual(CraftingDataPacket.uuidFor('stick'));
            expect(CraftingDataPacket.uuidFor('torch')).toHaveLength(16);
        });

        it('writes the payload it was given instead, when the content build supplies one', () => {
            // The content build compiles Java's grammar straight into these
            // lists, so there is no `Recipe` object for the packet to sort.
            const packet = new CraftingDataPacket();
            packet.recipes = [new ShapelessRecipe('ignored', 'crafting_table', [], [], 0)];
            packet.payload = {
                shaped: [],
                shapeless: [],
                smithingTransform: [],
                potionMixes: [
                    { inputId: 373, inputMeta: 0, reagentId: 377, reagentMeta: 0, outputId: 373, outputMeta: 5 }
                ],
                cleanRecipes: false
            };
            packet.encode();

            const stream = new BinaryStream(packet.getBuffer());
            stream.readUnsignedVarInt(); // Header.

            // Every list before the potion mixes is empty, including the
            // shapeless one `recipes` would have filled.
            for (let i = 0; i < LISTS.indexOf('potionMixes'); i++) expect(stream.readUnsignedVarInt()).toBe(0);

            expect(stream.readUnsignedVarInt()).toBe(1);
            // Six varint32 in wire order: the input, the reagent, the output.
            expect([
                stream.readVarInt(),
                stream.readVarInt(),
                stream.readVarInt(),
                stream.readVarInt(),
                stream.readVarInt(),
                stream.readVarInt()
            ]).toEqual([373, 0, 377, 0, 373, 5]);

            expect(stream.readUnsignedVarInt()).toBe(0); // Container mixes.
            expect(stream.readUnsignedVarInt()).toBe(0); // Material reducers.
            expect(stream.readBoolean()).toBe(false); // Clean recipes.
            expect(stream.feof()).toBe(true);
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
            packet.recipes = [odd];

            expect(() => packet.encode()).toThrow(/cannot write/);
        });
    });
});
