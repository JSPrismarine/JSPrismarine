import { item_table as ItemTable, item_tags as ItemTags } from '@jsprismarine/bedrock-data';
import { vanillaRecipes } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { Item } from '../item/Item';
import { FurnaceRecipe, ShapedRecipe, ShapelessRecipe } from './Recipe';
import { TagIngredient } from './RecipeIngredient';
import VanillaRecipes from './VanillaRecipes';

const known = (name: string) => ItemTable[name] !== undefined;

/** Every tag name the generated catalog asks for, on either side of a recipe. */
const tagsInCatalog = (): string[] => {
    const seen = new Set<string>();
    for (const recipe of (vanillaRecipes as { recipes: Array<Record<string, unknown>> }).recipes) {
        for (const value of Object.values(recipe)) {
            for (const reference of Array.isArray(value) ? value : [value]) {
                if (reference !== null && typeof reference === 'object' && 'tag' in reference) {
                    const { tag } = reference;
                    if (typeof tag === 'string') seen.add(tag);
                }
            }
        }
    }
    return [...seen].sort();
};

describe('crafting', () => {
    describe('VanillaRecipes', () => {
        const loaded = VanillaRecipes.load(known);

        it('leaves out what the server could not hand over', () => {
            // The filter is correctness before economy: a recipe whose output cannot be built
            // is one a player is invited to make and then cannot be given.
            const nothingResolves = VanillaRecipes.load(() => false);

            expect(nothingResolves).toHaveLength(0);
        });

        it('resolves every tag the catalog names to members the item table knows', () => {
            // The tag table and the catalog have to describe the same release. When they did
            // not, `minecraft:egg`, `minecraft:metal_nuggets` and `minecraft:mushrooms_for_stew`
            // were named by recipes and absent from the tags, and the 21 recipes asking for
            // them were dropped - quietly, because an unsatisfiable ingredient is a correct
            // reason to drop a recipe and nothing distinguished it from a real one.
            const tags = tagsInCatalog();

            expect(tags.length).toBeGreaterThan(0);
            for (const tag of tags) {
                expect(ItemTags[tag]?.filter(known) ?? []).not.toHaveLength(0);
            }
        });

        it('hands a tag ingredient the members it is satisfied by', () => {
            // A tag the loader accepted but filled with nothing would match no item, so the
            // recipe would load and then never fire.
            const tagged = loaded.flatMap((recipe) =>
                recipe.getIngredients().filter((ingredient) => ingredient instanceof TagIngredient)
            );

            expect(tagged.length).toBeGreaterThan(0);
            for (const ingredient of tagged) {
                const members = ItemTags[ingredient.tag] ?? [];

                expect(members.some((name) => ingredient.matches(new Item({ runtimeId: 0, name })))).toBe(true);
            }
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
