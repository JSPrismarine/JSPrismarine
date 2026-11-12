import { createRecipeBook } from '@jsprismarine/recipes';
import type { CookingRecipe, RecipeInput } from '@jsprismarine/recipes';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import type PlayerSession from '../network/PlayerSession';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BlockEntityRegistry } from '../blockentity/BlockEntityRegistry';
import { Furnace } from '../blockentity/BlockEntities';
import { blockEntityRecord } from '../blockentity/contentRecord';
import { fixtureContentOptions } from '../content/testing';
import { buildServerContent } from '../content/ServerContent';
import type { ServerContent } from '../content/ServerContent';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import BlockUpdateScheduler from './BlockUpdateScheduler';
import { inertEntityRuntime } from '../testing/entityServer';
import { sealBlockKinds } from '../testing/sealedBlocks.test.helper';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';
import { stub } from '../testing/stub.test.helper';
import { fakeLevel } from '../testing/level';
import { Position } from './Position';
import { Dimensions } from './DimensionType';
import Chunk from './chunk/Chunk';
import { World } from './World';
import { tickFurnace } from './cooking';

const ITEM_IDS = new Set([
    'minecraft:stone',
    'minecraft:redstone_lamp',
    'minecraft:diamond_pickaxe',
    'minecraft:iron_ore',
    'minecraft:iron_ingot',
    'minecraft:coal'
]);

const SMELTING_RECIPE: CookingRecipe = {
    id: 'fixture:iron_ore',
    type: 'minecraft:smelting',
    station: 'smelting',
    ingredient: { items: ['minecraft:iron_ore'], tags: [], components: [] },
    result: { id: 'minecraft:iron_ingot', count: 1 },
    experience: 0.7,
    cookingTime: 200
};

const recipeBook = createRecipeBook([SMELTING_RECIPE]);
const recipeMatch = vi.fn((input: RecipeInput) => recipeBook.match(input));
const baseContent = buildServerContent(
    fixtureContentOptions({
        itemDefinitions: vanillaItemDefinitions().filter(({ identifier }) => ITEM_IDS.has(identifier))
    })
);
const content: ServerContent = { ...baseContent, recipes: { ...recipeBook, match: recipeMatch } };

const item = (identifier: string, slot: number, count = 1): NBTTagCompound => {
    const stack = new NBTTagCompound('');
    stack.addValue('Name', new Types.StringVal(identifier));
    stack.addValue('Count', new Types.ByteVal(count));
    stack.addValue('Slot', new Types.ByteVal(slot));
    return stack;
};

const furnaceOf = (items: readonly NBTTagCompound[], burnTime = 0, cookTime = 0): Furnace => {
    const tags = new NBTTagCompound('');
    tags.addValue('id', new Types.StringVal('Furnace'));
    tags.addValue('x', new Types.NumberVal(8));
    tags.addValue('y', new Types.NumberVal(64));
    tags.addValue('z', new Types.NumberVal(8));
    tags.addValue('BurnTime', new Types.ShortVal(burnTime));
    tags.addValue('CookTime', new Types.ShortVal(cookTime));
    if (items.length > 0) tags.addValue('Items', new Set(items));

    const furnace = BlockEntityRegistry.fromNBT(tags);
    if (!(furnace instanceof Furnace)) throw new Error('fixture did not load as a furnace');
    return furnace;
};

const tickWorld = (entity: Furnace, blockIdentifier: string) => {
    const chunk = new Chunk(0, 0);
    const blockRuntimeId = BlockRuntimeIds.tryGetByState(blockIdentifier, {});
    if (blockRuntimeId === null) throw new Error(`missing ${blockIdentifier} block state`);
    chunk.setBlockRuntimeId(8, 64, 8, blockRuntimeId);
    chunk.setBlockEntity(entity);
    const chunks = new Map([[Chunk.packXZ(0, 0), chunk]]);
    const players = new Map<number, PlayerSession>();
    // A real store, so the writes are logged as a tick logs them.
    const runtime = inertEntityRuntime();
    const store = runtime.runtime.store;
    store.beginTick();
    const world: World = Object.assign(Object.create(World.prototype), {
        chunks,
        players,
        dimension: Dimensions.Overworld,
        level: fakeLevel(),
        blockUpdates: new BlockUpdateScheduler(),
        systems: { onBlockChanged: () => {} },
        server: {
            getContent: () => content,
            getLogger: () => ({ error: vi.fn() }),
            getEntityRuntime: () => runtime,
            hasEntityRuntime: () => true
        }
    });
    players.set(
        1,
        stub<PlayerSession>({
            isConnected: () => true,
            getViewPosition: () => new Position(8, 64, 8, world),
            getOpenBlockContainer: () => undefined,
            getViewDistance: () => 10
        })
    );

    // The sink the constructor would have set, which reads the sealed ticks too.
    world.attachChangeSink(NULL_WORLD_CHANGE_SINK);
    /** What the open tick changed in the blocks, which seals it and opens the next. */
    const changes = (): string[] => sealBlockKinds(store);
    const refs = world['getPlayerChunkRefCounts']();
    refs.synchronize(players);

    return { chunk, changes, refs, world };
};

describe('tickFurnace', () => {
    beforeEach(() => {
        recipeMatch.mockClear();
    });

    it.each([
        ['empty', []],
        ['input without fuel', [item('minecraft:iron_ore', 0)]],
        ['fuel without input', [item('minecraft:coal', 1)]],
        ['output without input or fuel', [item('minecraft:iron_ingot', 2)]]
    ] as const)('skips an unlit furnace with zero timers when %s', (_description, items) => {
        const result = tickFurnace(content, furnaceOf(items), 'minecraft:furnace');

        expect(result).toBeUndefined();
        expect(recipeMatch).not.toHaveBeenCalled();
    });

    it('leaves an idle loaded output stack untouched instead of normalizing its NBT', () => {
        const output = item('minecraft:iron_ingot', 2);
        const opaque = new NBTTagCompound('tag');
        opaque.addValue('future_component', new Types.StringVal('keep'));
        output.addChild(opaque);
        const furnace = furnaceOf([output]);
        const storedBefore = [...furnace.getItems()][0]!;

        expect(tickFurnace(content, furnace, 'minecraft:furnace')).toBeUndefined();

        const storedAfter = [...furnace.getItems()][0]!;
        expect(storedAfter).toBe(storedBefore);
        expect(storedAfter.getCompound('tag', false)?.getString('future_component', '')).toBe('keep');
        // The normal serializer still canonicalizes modeled furnace fields when a save needs them.
        expect(furnace.toNBT().getShort('BurnTime', -1)).toBe(0);
    });

    it('still repairs a lit block whose burn timer has already reached zero', () => {
        const result = tickFurnace(content, furnaceOf([]), 'minecraft:lit_furnace');

        expect(result?.blockIdentifier).toBe('minecraft:furnace');
        expect(result?.tags.getShort('BurnTime', -1)).toBe(0);
        expect(recipeMatch).not.toHaveBeenCalled();
    });

    it('matches recipes only for an input while burning or while fuel can start it', () => {
        const burning = furnaceOf([item('minecraft:iron_ore', 0)], 2);
        const fuelled = furnaceOf([item('minecraft:iron_ore', 0), item('minecraft:coal', 1)]);
        const noInput = furnaceOf([item('minecraft:coal', 1)], 2);
        const idleWithoutFuel = furnaceOf([item('minecraft:iron_ore', 0)]);

        expect(tickFurnace(content, burning, 'minecraft:lit_furnace')?.tags.getShort('BurnTime', -1)).toBe(1);
        expect(recipeMatch).toHaveBeenCalledTimes(1);

        recipeMatch.mockClear();
        expect(tickFurnace(content, fuelled, 'minecraft:furnace')?.blockIdentifier).toBe('minecraft:lit_furnace');
        expect(recipeMatch).toHaveBeenCalledTimes(1);

        recipeMatch.mockClear();
        expect(tickFurnace(content, noInput, 'minecraft:lit_furnace')?.blockIdentifier).toBe('minecraft:lit_furnace');
        expect(tickFurnace(content, idleWithoutFuel, 'minecraft:furnace')).toBeUndefined();
        expect(recipeMatch).not.toHaveBeenCalled();
    });

    it('finishes a recipe with the existing Java timer, inventory, and lit-state order', () => {
        const furnace = furnaceOf([item('minecraft:iron_ore', 0, 2), item('minecraft:iron_ingot', 2, 63)], 2, 199);

        const result = tickFurnace(content, furnace, 'minecraft:lit_furnace');

        expect(result?.blockIdentifier).toBe('minecraft:lit_furnace');
        expect(result?.inventoryChanged).toBe(true);
        expect(result?.tags.getShort('BurnTime', -1)).toBe(1);
        expect(result?.tags.getShort('CookTime', -1)).toBe(0);
        expect(result?.tags.getShort('CookTimeTotal', -1)).toBe(200);
        expect(result && blockItems(result.tags)).toEqual([
            { identifier: 'minecraft:iron_ore', count: 1 },
            undefined,
            { identifier: 'minecraft:iron_ingot', count: 64 }
        ]);
    });

    it('consumes fuel and advances cooking together when an unlit furnace can start', () => {
        const furnace = furnaceOf([item('minecraft:iron_ore', 0, 2), item('minecraft:coal', 1)]);

        const result = tickFurnace(content, furnace, 'minecraft:furnace');

        expect(result?.blockIdentifier).toBe('minecraft:lit_furnace');
        expect(result?.inventoryChanged).toBe(true);
        expect(result?.tags.getShort('BurnTime', 0)).toBeGreaterThan(0);
        expect(result?.tags.getShort('CookTime', -1)).toBe(1);
        expect(result && blockItems(result.tags)).toEqual([{ identifier: 'minecraft:iron_ore', count: 2 }]);
    });
});

const blockItems = (tags: NBTTagCompound) => blockEntityRecord(tags).items;

describe('world cooking station tick', () => {
    it('emits no block-entity update for an idle loaded furnace', () => {
        const furnace = furnaceOf([item('minecraft:iron_ingot', 2)]);
        const { chunk, changes, refs, world } = tickWorld(furnace, 'minecraft:furnace');
        const getBlockEntity = vi.spyOn(chunk, 'getBlockEntity');

        world['tickCookingStations'](refs);

        expect(getBlockEntity).not.toHaveBeenCalled();
        expect(changes()).toEqual([]);
        expect(chunk.getBlock(8, 64, 8).name).toBe('minecraft:furnace');
    });

    it('writes the state change before its block entity when the last burn tick expires', () => {
        const furnace = furnaceOf([item('minecraft:iron_ore', 0)], 1);
        const { changes, chunk, refs, world } = tickWorld(furnace, 'minecraft:lit_furnace');
        world['tickCookingStations'](refs);

        // The swap takes the furnace's block entity with the block, and the station puts it back
        // after: the block is announced before the block entity a client is sent.
        const kinds = changes();
        expect(kinds.indexOf('block')).toBeGreaterThan(-1);
        expect(kinds.lastIndexOf('block-entity')).toBeGreaterThan(kinds.indexOf('block'));
        expect(chunk.getBlock(8, 64, 8).name).toBe('minecraft:furnace');
        expect(blockItems(chunk.getBlockEntity(8, 64, 8)!.toNBT())).toEqual([
            { identifier: 'minecraft:iron_ore', count: 1 }
        ]);
    });
});
