import { describe, expect, it } from 'vitest';

import { advancementInventoryChanged } from '../advancement/triggers';
import { advancementsOf, loadAdvancements } from '../advancement/progress';
import { buildServerContent } from '../content/ServerContent';
import { definitionOf, definitionsOf } from '../content/ContentOptions';
import type { ServerContent } from '../content/ServerContent';
import { fixtureBlockPalette, fixtureItemDefinitions } from '../content/testing';
import HumanInventory from '../inventory/HumanInventory';
import { Item } from '../item/Item';
import type PlayerSession from '../player/PlayerSession';
import type { RecipeBookChange } from '../player/presenter/SessionPresenter';
import type Server from '../Server';
import { sessionOnPrototype } from '../testing/storePlayer.test.helper';
import { stub } from '../testing/stub.test.helper';
import type { World } from '../world/World';
import {
    forgetRecipeBook,
    isLearnableRecipe,
    loadRecipeBook,
    lockRecipes,
    recipeBookOf,
    rewardedRecipesOf,
    showRecipeBook,
    unlockRecipes
} from './recipeBook';

/**
 * An advancement in the shape of Java 26.3's `recipes/` advancements: holding the ingredient, or
 * already having the recipe, completes it, and it rewards the recipe. The ingredient is stone,
 * one of the items the fixture registry holds.
 */
const torchAdvancement = definitionOf('advancements', 'minecraft:recipes/misc/torch', {
    criteria: {
        has_stone: { conditions: { items: [{ items: 'minecraft:stone' }] }, trigger: 'minecraft:inventory_changed' },
        has_the_recipe: { conditions: { recipes: 'minecraft:torch' }, trigger: 'minecraft:recipe_unlocked' }
    },
    requirements: [['has_the_recipe', 'has_stone']],
    rewards: { recipes: ['minecraft:torch'] }
});

const content = (): ServerContent =>
    buildServerContent({
        load: () => ({
            definitions: definitionsOf({
                advancements: new Map([[torchAdvancement.identifier, torchAdvancement]]),
                recipesJava: new Map([
                    [
                        'minecraft:torch',
                        definitionOf('recipesJava', 'minecraft:torch', {
                            type: 'minecraft:crafting_shaped',
                            key: { '#': 'minecraft:stone', X: 'minecraft:stone' },
                            pattern: ['X', '#'],
                            result: { count: 4, id: 'minecraft:torch' }
                        })
                    ],
                    [
                        'minecraft:firework_rocket',
                        definitionOf('recipesJava', 'minecraft:firework_rocket', {
                            type: 'minecraft:crafting_special_firework_rocket',
                            fuel: 'minecraft:gunpowder',
                            result: { count: 3, id: 'minecraft:firework_rocket' },
                            shell: 'minecraft:paper',
                            star: 'minecraft:firework_star'
                        })
                    ]
                ])
            }),
            diagnostics: []
        }),
        blockPalette: fixtureBlockPalette(),
        itemDefinitions: fixtureItemDefinitions()
    });

let nextRuntimeId = 1n << 41n;

/** A player whose book was loaded at join, with the changes its client was shown. */
const joined = (stored: unknown = []) => {
    const runtimeId = nextRuntimeId++;
    const built = content();
    const inventory = new HumanInventory();
    const shown: RecipeBookChange[] = [];
    const server = stub<Server>({ getContent: () => built, getJavaEnglish: () => new Map() });
    const world = stub<World>({ getViewers: () => [], getServer: () => server });
    const position = () => ({ getX: () => 0, getY: () => 64, getZ: () => 0 }) as never;
    const player: PlayerSession = sessionOnPrototype(
        {
            getRuntimeId: () => runtimeId,
            getType: () => 'minecraft:player',
            getName: () => `book-${runtimeId}`,
            getXUID: () => null,
            getPosition: position,
            getServer: () => server,
            getWorld: () => world,
            getInventory: () => inventory,
            getEquipment: () => ({}),
            getStatusEffects: () => [],
            gamemode: 0,
            isSneaking: () => false,
            isFlying: () => false,
            getFood: () => 20,
            getSaturation: () => 5
        },
        { runtimeId }
    );
    const presenter = {
        showRecipeBook: async (change: RecipeBookChange) => {
            shown.push(change);
        }
    };
    loadAdvancements(player.keyed(), undefined);
    loadRecipeBook(player.keyed(), stored, presenter, () => rewardedRecipesOf(player.keyed()));
    return { player, inventory, shown, built };
};

const torchDone = (player: PlayerSession, built: ServerContent): boolean => {
    const advancement = built.advancements.get(torchAdvancement.identifier);
    return advancement !== undefined && advancementsOf(player.keyed()).isDone(advancement);
};

describe('the recipe book', () => {
    it('unlocks a recipe when its advancement rewards it, as picking up its ingredient does', () => {
        const { player, inventory, shown } = joined();

        const stone = new Item({ name: 'minecraft:stone' });
        inventory.container('inventory').set(0, stone);
        advancementInventoryChanged(player, stone);

        expect(recipeBookOf(player.keyed())).toEqual(['minecraft:torch']);
        expect(shown).toEqual([{ kind: 'unlocked', recipes: ['minecraft:torch'] }]);
        forgetRecipeBook(player.keyed());
    });

    it('completes the recipe advancement when a command unlocks the recipe', () => {
        const { player, built, shown } = joined();

        expect(unlockRecipes(player, ['minecraft:torch'])).toEqual(['minecraft:torch']);

        expect(torchDone(player, built)).toBe(true);
        // The reward found the recipe already unlocked, so the client was told once.
        expect(shown).toEqual([{ kind: 'unlocked', recipes: ['minecraft:torch'] }]);
        forgetRecipeBook(player.keyed());
    });

    it('locks only what the book holds, and tells the client', () => {
        const { player, shown } = joined(['minecraft:torch']);

        expect(lockRecipes(player.keyed(), ['minecraft:torch', 'minecraft:torch'])).toEqual(['minecraft:torch']);
        expect(lockRecipes(player.keyed(), ['minecraft:torch'])).toEqual([]);

        expect(shown).toEqual([{ kind: 'locked', recipes: ['minecraft:torch'] }]);
        forgetRecipeBook(player.keyed());
    });

    it('sends the stored book whole at join', async () => {
        const { player, shown } = joined(['minecraft:torch']);

        await showRecipeBook(player.keyed());

        expect(shown).toEqual([{ kind: 'initial', recipes: ['minecraft:torch'] }]);
        forgetRecipeBook(player.keyed());
    });

    it('fills a record without a book from the advancements it completed', () => {
        const { player, inventory } = joined();
        const stone = new Item({ name: 'minecraft:stone' });
        inventory.container('inventory').set(0, stone);
        advancementInventoryChanged(player, stone);
        const key = player.keyed();

        // The same record read back with no book, as one saved before the book was.
        loadRecipeBook(key, undefined, undefined, () => rewardedRecipesOf(key));
        expect(recipeBookOf(key)).toEqual(['minecraft:torch']);

        // A saved empty book stays empty.
        loadRecipeBook(key, [], undefined, () => rewardedRecipesOf(key));
        expect(recipeBookOf(key)).toEqual([]);
        forgetRecipeBook(key);
    });

    it('leaves out the recipes Java works out in code', () => {
        const { built } = joined();

        expect(built.recipes.recipes.filter(isLearnableRecipe).map((recipe) => recipe.id)).toEqual(['minecraft:torch']);
    });
});
