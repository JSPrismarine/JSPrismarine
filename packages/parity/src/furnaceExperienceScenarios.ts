/**
 * The `furnace-experience` mechanic of the `gameplay.mechanics` family: the experience Java
 * 26.3's furnaces, blast furnaces and smokers pay a player who takes from the result slot, run
 * through the server's own furnace tick and payout over the real content stack.
 */
import type { ItemDrop } from '@jsprismarine/block-behaviors';
import { javaItemToBedrock } from '@jsprismarine/mapping';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { Furnace } from '@jsprismarine/prismarine/blockentity/BlockEntities';
import { applyBlockEntityRecord, blockEntityRecord } from '@jsprismarine/prismarine/blockentity/contentRecord';
import { takeFurnaceExperience, tickFurnace } from '@jsprismarine/prismarine/world/cooking';
import type { CookingRecipe } from '@jsprismarine/recipes';

import type { BehaviorScenario } from './behaviorScenarios.ts';
import type { JavaFurnaceRecipe } from './goldens.ts';
import { loadJavaFurnaceRecipes } from './goldens.ts';
import { gameplayId } from './javaGameplay.ts';
import { serverContent } from './serverStack.ts';

/** One gameplay identifier a scenario compares, such as `mechanic/furnace-experience`. */
interface FurnaceSubject {
    readonly id: string;
}

const MECHANIC: FurnaceSubject = { id: gameplayId('mechanic', 'furnace-experience') };

/** The block each furnace recipe type cooks in, lit so a tick can finish an item. */
const STATION_BLOCKS: Readonly<Record<string, string>> = {
    'minecraft:smelting': 'minecraft:lit_furnace',
    'minecraft:blasting': 'minecraft:lit_blast_furnace',
    'minecraft:smoking': 'minecraft:lit_smoker'
};

/** A cook timer past every recipe's total, so the next tick finishes the item in the input. */
const FINISHING_COOK_TIME = 30_000;

/**
 * What Java's `createExperience` pays for one and for five cooks of a recipe, by the recipe's
 * `experience`: first under a draw of 0, which always takes the extra point, then under a draw
 * just below 1, which never does. Worked by hand in float, for every value the vanilla furnace
 * recipes use. `0.2f * 5` rounds to exactly 1, so it has no fraction and both draws pay 1;
 * `0.3f * 5` rounds to 1.5, `0.35f * 5` to 1.75 and `0.7f * 5` to 3.5.
 */
const WORKED_PAYOUTS: Readonly<Record<string, Readonly<Record<1 | 5, readonly [number, number]>>>> = {
    '0.1': { 1: [1, 0], 5: [1, 0] },
    '0.15': { 1: [1, 0], 5: [1, 0] },
    '0.2': { 1: [1, 0], 5: [1, 1] },
    '0.3': { 1: [1, 0], 5: [2, 1] },
    '0.35': { 1: [1, 0], 5: [2, 1] },
    '0.7': { 1: [1, 0], 5: [4, 3] },
    '1': { 1: [1, 1], 5: [5, 5] },
    '2': { 1: [2, 2], 5: [10, 10] }
};

/** Java's furnace recipes, each with the server's own copy. */
const furnaceRecipes = (): { readonly java: JavaFurnaceRecipe; readonly recipe: CookingRecipe | undefined }[] =>
    loadJavaFurnaceRecipes().map((java) => {
        const recipe = serverContent().recipes.get(java.id);
        return { java, recipe: recipe?.type === java.type ? recipe : undefined };
    });

/** The Bedrock stack a Java ingredient's first item maps to, if it maps. */
const inputOf = (recipe: CookingRecipe): ItemDrop | undefined => {
    const javaId = recipe.ingredient.items[0];
    if (javaId === undefined) return undefined;
    const mapping = javaItemToBedrock(javaId);
    if (mapping.kind !== 'mapped') return undefined;
    return {
        identifier: mapping.bedrock.identifier,
        count: 64,
        ...(mapping.bedrock.data === undefined ? {} : { meta: mapping.bedrock.data })
    };
};

/** A lit furnace block entity holding these slots, about to finish the item in its input. */
const furnaceHolding = (items: readonly (ItemDrop | undefined)[], data: Record<string, unknown> = {}): Furnace => {
    const tags = new NBTTagCompound('');
    tags.addValue('id', new Types.StringVal('Furnace'));
    tags.addValue('x', new Types.NumberVal(0));
    tags.addValue('y', new Types.NumberVal(64));
    tags.addValue('z', new Types.NumberVal(0));
    tags.addValue('BurnTime', new Types.ShortVal(1600));
    tags.addValue('CookTime', new Types.ShortVal(FINISHING_COOK_TIME));
    applyBlockEntityRecord(tags, { ...data, items, capacity: 3 });
    return Furnace.fromNBT(tags);
};

/**
 * Cooks `count` items of each recipe in turn in one furnace, through the server's tick.
 *
 * @returns The furnace's record afterwards, or why the server did not cook them.
 */
const cook = (
    block: string,
    batches: readonly { readonly recipe: CookingRecipe; readonly count: number }[]
): Record<string, unknown> | string => {
    const content = serverContent();
    let record: Record<string, unknown> = {};
    for (const { recipe, count } of batches) {
        const input = inputOf(recipe);
        if (input === undefined) return `${recipe.ingredient.items[0] ?? 'its ingredient'} maps to no Bedrock item`;
        for (let cooked = 0; cooked < count; cooked += 1) {
            // A fresh result slot each time, so a full or different stack never stops the cook.
            const furnace = furnaceHolding([input, { identifier: 'minecraft:coal', count: 64 }, undefined], record);
            const ticked = tickFurnace(content, furnace, block);
            if (ticked?.changedSlots.includes(2) !== true) return `the server did not cook ${recipe.id}`;
            const { items: _items, capacity: _capacity, ...rest } = blockEntityRecord(ticked.tags);
            record = rest;
        }
    }
    return record;
};

/** Draws that always and never give the extra point, so each fraction's rounding shows. */
const DRAWS = [0, 1 - 2 ** -24] as const;

/** The scenarios that compare a furnace's experience with Java's, one row each. */
export const furnaceExperienceScenarios: readonly BehaviorScenario<FurnaceSubject>[] = [
    {
        name: 'furnace-experience-per-recipe',
        java: "Taking from a furnace's result pays each recipe it cooked floor(count * experience) points, and one more with the chance of the fraction left over.",
        reference: 'Java AbstractFurnaceBlockEntity.createExperience and data/minecraft/recipe',
        subjects: () => [MECHANIC],
        idOf: (entry) => entry.id,
        aspects: () => ['behavior'],
        run: () => {
            const content = serverContent();
            for (const { java, recipe } of furnaceRecipes()) {
                if (recipe === undefined) return `the server loaded no ${java.id}`;
                const worked = WORKED_PAYOUTS[String(java.experience)];
                if (worked === undefined) return `no worked payout for ${java.id}'s experience of ${java.experience}`;
                // One item, and five, where a fraction such as 0.35's adds up past a whole point.
                for (const count of [1, 5] as const) {
                    const record = cook(STATION_BLOCKS[java.type] ?? '', [{ recipe, count }]);
                    if (typeof record === 'string') return record;
                    for (const [index, draw] of DRAWS.entries()) {
                        const paid = takeFurnaceExperience(content, record, () => draw);
                        const want = worked[count][index];
                        const got = paid?.payouts.join(',') ?? 'nothing';
                        if (got !== String(want))
                            return `${count} of ${java.id} (experience ${java.experience}) pay ${got} at a draw of ${draw}, Java ${want}`;
                    }
                }
            }
            return undefined;
        }
    },
    {
        name: 'furnace-experience-once',
        java: 'A furnace that cooked two recipes pays each its own award, and pays nothing more until it cooks again.',
        reference:
            'Java AbstractFurnaceBlockEntity.getRecipesToAwardAndPopExperience and awardUsedRecipesAndPopExperience',
        subjects: () => [MECHANIC],
        idOf: (entry) => entry.id,
        aspects: () => ['behavior'],
        run: () => {
            const content = serverContent();
            const recipes = furnaceRecipes().filter(
                (entry): entry is { java: JavaFurnaceRecipe; recipe: CookingRecipe } =>
                    entry.java.type === 'minecraft:smelting' &&
                    entry.recipe !== undefined &&
                    inputOf(entry.recipe) !== undefined &&
                    WORKED_PAYOUTS[String(entry.java.experience)] !== undefined
            );
            const [first, second] = recipes;
            if (first === undefined || second === undefined) return 'the server has fewer than two smelting recipes';

            const record = cook('minecraft:lit_furnace', [
                { recipe: first.recipe, count: 5 },
                { recipe: second.recipe, count: 1 }
            ]);
            if (typeof record === 'string') return record;
            const paid = takeFurnaceExperience(content, record, () => 0);
            const want = [
                WORKED_PAYOUTS[String(first.java.experience)]?.[5][0],
                WORKED_PAYOUTS[String(second.java.experience)]?.[1][0]
            ]
                .sort((left = 0, right = 0) => left - right)
                .join(',');
            const got = [...(paid?.payouts ?? [])].sort((left, right) => left - right).join(',');
            if (got !== want) return `${first.java.id} and ${second.java.id} pay ${got || 'nothing'}, Java ${want}`;

            const again = paid === undefined ? undefined : takeFurnaceExperience(content, paid.data, () => 0);
            return again === undefined || again.payouts.length === 0
                ? undefined
                : `a second take pays ${again.payouts.join(',')} again, Java nothing`;
        }
    }
];
