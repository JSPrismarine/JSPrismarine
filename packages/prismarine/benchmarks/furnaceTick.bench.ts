/**
 * Benchmarks idle and active furnace ticks against a 73-recipe smelting book.
 *
 * Run with `node packages/prismarine/benchmarks/run.mjs packages/prismarine/benchmarks/furnaceTick.bench.ts`.
 */
import os from 'node:os';

import { createRecipeBook } from '@jsprismarine/recipes';
import type { CookingRecipe } from '@jsprismarine/recipes';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';

import { BlockEntityRegistry } from '../src/blockentity/BlockEntityRegistry';
import { fixtureContentOptions } from '../src/content/testing';
import { buildServerContent } from '../src/content/ServerContent';
import type { ServerContent } from '../src/content/ServerContent';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import { tickFurnace } from '../src/world/cooking';

const OPERATIONS = 20_000;
const SAMPLES = 5;
const ITEM_IDS = new Set([
    ...['minecraft:stone', 'minecraft:redstone_lamp', 'minecraft:diamond_pickaxe'],
    'minecraft:iron_ore',
    'minecraft:iron_ingot',
    'minecraft:coal'
]);

const recipes: CookingRecipe[] = Array.from({ length: 73 }, (_entry, index) => ({
    id: `fixture:smelting_${String(index).padStart(2, '0')}`,
    type: 'minecraft:smelting',
    station: 'smelting',
    ingredient: {
        items: [index === 72 ? 'minecraft:iron_ore' : `fixture:item_${index}`],
        tags: [],
        components: []
    },
    result: { id: 'minecraft:iron_ingot', count: 1 },
    experience: 0.7,
    cookingTime: 200
}));

const baseContent = buildServerContent(
    fixtureContentOptions({
        itemDefinitions: vanillaItemDefinitions().filter(({ identifier }) => ITEM_IDS.has(identifier))
    })
);
let recipeMatches = 0;
let candidateVisits = 0;
const recipeBook = createRecipeBook(recipes);
const content: ServerContent = {
    ...baseContent,
    recipes: {
        ...recipeBook,
        match(input) {
            recipeMatches++;
            candidateVisits += recipeBook.byStation(input.station).length;
            return recipeBook.match(input);
        }
    }
};

const item = (identifier: string, slot: number, count = 1): NBTTagCompound => {
    const stack = new NBTTagCompound('');
    stack.addValue('Name', new Types.StringVal(identifier));
    stack.addValue('Count', new Types.ByteVal(count));
    stack.addValue('Slot', new Types.ByteVal(slot));
    return stack;
};

const furnace = (
    slots: readonly NBTTagCompound[],
    burnTime = 0,
    cookTime = 0
): ReturnType<typeof BlockEntityRegistry.fromNBT> => {
    const tags = new NBTTagCompound('');
    tags.addValue('id', new Types.StringVal('Furnace'));
    tags.addValue('x', new Types.NumberVal(8));
    tags.addValue('y', new Types.NumberVal(64));
    tags.addValue('z', new Types.NumberVal(8));
    tags.addValue('BurnTime', new Types.ShortVal(burnTime));
    tags.addValue('CookTime', new Types.ShortVal(cookTime));
    if (slots.length > 0) tags.addValue('Items', new Set(slots));
    return BlockEntityRegistry.fromNBT(tags);
};

const scenarios = [
    { name: 'idle-empty', block: 'minecraft:furnace', entity: furnace([]) },
    {
        name: 'burning',
        block: 'minecraft:lit_furnace',
        entity: furnace([item('minecraft:iron_ore', 0)], 120, 40)
    },
    { name: 'no-fuel', block: 'minecraft:furnace', entity: furnace([item('minecraft:iron_ore', 0)]) },
    {
        name: 'finishing',
        block: 'minecraft:lit_furnace',
        entity: furnace([item('minecraft:iron_ore', 0)], 2, 199)
    },
    {
        name: 'changed-inventory',
        block: 'minecraft:furnace',
        entity: furnace([item('minecraft:iron_ore', 0, 2), item('minecraft:coal', 1)])
    }
] as const;

for (const scenario of scenarios) {
    const runs = Array.from({ length: SAMPLES }, () => {
        recipeMatches = 0;
        candidateVisits = 0;
        let writes = 0;
        const started = performance.now();
        for (let index = 0; index < OPERATIONS; index++) {
            if (tickFurnace(content, scenario.entity, scenario.block)?.inventoryChanged) writes++;
        }
        return {
            ms: performance.now() - started,
            recipeMatches,
            candidateVisits,
            writes
        };
    }).sort((left, right) => left.ms - right.ms);
    const median = runs[Math.floor(runs.length / 2)]!;
    console.log(
        JSON.stringify({
            benchmark: 'furnace-tick',
            scenario: scenario.name,
            node: process.version,
            platform: `${os.platform()}-${os.arch()}`,
            operations: OPERATIONS,
            medianMs: median.ms,
            recipeMatches: median.recipeMatches,
            candidateVisits: median.candidateVisits,
            inventoryChanges: median.writes
        })
    );
}
