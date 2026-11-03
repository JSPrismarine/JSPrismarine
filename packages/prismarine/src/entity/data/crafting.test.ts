import { createRecipeBook, parseRecipe } from '@jsprismarine/recipes';
import { describe, expect, it, vi } from 'vitest';

import { EntityRuntime } from './EntityRuntime';
import { TestEntityWorld } from './testing';
import { stub } from '../../testing/stub.test.helper';
import type { ServerContent } from '../../content/ServerContent';

const breadRecipe = parseRecipe('minecraft:bread', {
    type: 'minecraft:crafting_shaped',
    key: { W: 'minecraft:wheat' },
    pattern: ['WWW'],
    result: { id: 'minecraft:bread', count: 4 }
});
const parsedBreadRecipe = breadRecipe.recipe;

if (parsedBreadRecipe === undefined) throw new Error('the bread recipe fixture did not parse');

describe('EntityRuntime craftInto', () => {
    it('reuses immutable recipe candidates while recalculating counts and replacing the recipe book', () => {
        const originalBook = createRecipeBook([parsedBreadRecipe]);
        const originalMatcher = vi.spyOn(originalBook, 'matchAll');
        const emptyBook = createRecipeBook([]);
        const replacementMatcher = vi.spyOn(emptyBook, 'matchAll');
        const world = new TestEntityWorld();
        let activeBook = originalBook;
        const runtime = new EntityRuntime({
            content: () => stub<ServerContent>({ recipes: activeBook }),
            world: world.world,
            host: world.host
        });

        const first = runtime.craftInto('minecraft:wheat', 'minecraft:bread', 64, 32);
        expect(first).toEqual({
            recipeId: 'minecraft:bread',
            inputIdentifier: 'minecraft:wheat',
            inputCount: 24,
            outputIdentifier: 'minecraft:bread',
            craftedCount: 32,
            outputCount: 32
        });
        expect(originalMatcher).toHaveBeenCalledTimes(3);

        const second = runtime.craftInto('minecraft:wheat', 'minecraft:bread', 12, 5);
        expect(second).toEqual({
            recipeId: 'minecraft:bread',
            inputIdentifier: 'minecraft:wheat',
            inputCount: 6,
            outputIdentifier: 'minecraft:bread',
            craftedCount: 8,
            outputCount: 5
        });
        expect(second).not.toBe(first);
        expect(originalMatcher).toHaveBeenCalledTimes(3);

        activeBook = emptyBook;
        expect(runtime.craftInto('minecraft:wheat', 'minecraft:bread', 12, 5)).toBeUndefined();
        expect(replacementMatcher).toHaveBeenCalledTimes(9);
    });
});
