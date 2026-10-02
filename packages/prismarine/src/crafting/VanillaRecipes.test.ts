import { item_id_map as ItemIdMap } from '@jsprismarine/bedrock-data';
import { describe, expect, it } from 'vitest';

import { FurnaceRecipe, ShapedRecipe, ShapelessRecipe } from './Recipe';
import VanillaRecipes from './VanillaRecipes';

const known = (name: string) => (ItemIdMap as Record<string, number>)[name] !== undefined;

describe('crafting', () => {
    describe('VanillaRecipes', () => {
        const loaded = VanillaRecipes.load(known);

        it('leaves out what the server could not hand over', () => {
            // The filter is correctness before economy: a recipe whose output cannot be built
            // is one a player is invited to make and then cannot be given.
            const nothingResolves = VanillaRecipes.load(() => false);

            expect(nothingResolves).toHaveLength(0);
        });

        it('drops nothing against the real item table', () => {
            // It has nothing left to drop, and that is the point of where the data now comes
            // from. Two rounds of correction got here: the recipes are read from Mojang's own
            // files rather than a processed dump, and they are checked against the item table
            // a real server sends rather than a hand kept list that predated the flattening.
            // Either one alone still lost recipes - the first to names like `reeds` and
            // `emptymap` that only the old list knew, the second to names the old list had
            // never heard of.
            const everything = VanillaRecipes.load(() => true);

            expect(loaded.length).toBe(everything.length);
        });

        it('keeps only recipes whose every name is resolvable', () => {
            for (const recipe of loaded) {
                for (const output of recipe.getOutputs()) expect(known(output.getName())).toBe(true);
            }
        });

        it('gives every recipe an id of its own', () => {
            // Net ids index this list, so two recipes sharing an id would be two recipes the
            // server cannot tell apart.
            const ids = new Set(loaded.map((recipe) => recipe.id));

            expect(ids.size).toBe(loaded.length);
        });

        it('reads a shaped pattern, holes and all', () => {
            // Sticks: one plank above another, in a one-wide two-tall pattern.
            const sticks = loaded.find(
                (recipe): recipe is ShapedRecipe =>
                    recipe instanceof ShapedRecipe && recipe.getOutputs()[0]?.getName() === 'minecraft:stick'
            );

            expect(sticks).toBeDefined();
            expect(sticks!.width * sticks!.height).toBeGreaterThan(0);
            expect(sticks!.at(0, 0)).not.toBeNull();
        });

        it('reads a pattern with an empty slot as an empty slot', () => {
            const withHole = loaded.find(
                (recipe): recipe is ShapedRecipe =>
                    recipe instanceof ShapedRecipe &&
                    Array.from({ length: recipe.width * recipe.height }).some(
                        (_, i) => recipe.at(i % recipe.width, Math.floor(i / recipe.width)) === null
                    )
            );

            expect(withHole).toBeDefined();
            // A hole is a slot that must stay empty, not a slot that was forgotten.
            expect(withHole!.getIngredients().length).toBeLessThan(withHole!.width * withHole!.height);
        });

        it('reads the furnace family, which differs by station rather than by shape', () => {
            const furnace = loaded.filter((recipe) => recipe instanceof FurnaceRecipe);
            const stations = new Set(furnace.map((recipe) => recipe.station));

            expect(furnace.length).toBeGreaterThan(0);
            expect(stations).toContain('furnace');
            expect(stations).toContain('blast_furnace');
        });

        it('reads shapeless recipes', () => {
            expect(loaded.some((recipe) => recipe instanceof ShapelessRecipe)).toBe(true);
        });

        it('does not carry a wildcard meta into an output', () => {
            // A wildcard is a question and an output is an answer, so 32767 on the way out
            // would ask the client for an item that does not exist.
            for (const recipe of loaded) {
                for (const output of recipe.getOutputs()) expect(output.meta).not.toBe(32767);
            }
        });
    });
});
