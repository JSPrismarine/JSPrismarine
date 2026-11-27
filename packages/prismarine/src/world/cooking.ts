/** Server-side cooking for the furnace, blast furnace, and smoker block entities. */
import type { BlockEntityData, ItemDrop } from '@jsprismarine/block-behaviors';
import {
    burnTimeOf,
    DEFAULT_PROVIDER_CONTEXT,
    evaluateNumberProvider,
    FAST_COOKING_CONTEXT,
    itemTypesTable,
    speedMultiplierOf
} from '@jsprismarine/items';
import { javaItemToBedrock } from '@jsprismarine/mapping';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';

import { Furnace } from '../blockentity/BlockEntities';
import type { BlockEntity } from '../blockentity/BlockEntity';
import { applyBlockEntityRecord, blockEntityRecord } from '../blockentity/contentRecord';
import type { ServerContent } from '../content/ServerContent';
import { isRecord } from '../utils/isRecord';
import type { Random } from '../utils/Random';

/** The cooking rule and lit block name for one furnace block. */
interface Cooker {
    readonly station: 'smelting' | 'blasting' | 'smoking';
    readonly unlitIdentifier: string;
    readonly litIdentifier: string;
}

/** Block identifiers whose inventories use the furnace block entity and cooking rules. */
const COOKERS: Readonly<Record<string, Cooker>> = {
    'minecraft:furnace': {
        station: 'smelting',
        unlitIdentifier: 'minecraft:furnace',
        litIdentifier: 'minecraft:lit_furnace'
    },
    'minecraft:lit_furnace': {
        station: 'smelting',
        unlitIdentifier: 'minecraft:furnace',
        litIdentifier: 'minecraft:lit_furnace'
    },
    'minecraft:blast_furnace': {
        station: 'blasting',
        unlitIdentifier: 'minecraft:blast_furnace',
        litIdentifier: 'minecraft:lit_blast_furnace'
    },
    'minecraft:lit_blast_furnace': {
        station: 'blasting',
        unlitIdentifier: 'minecraft:blast_furnace',
        litIdentifier: 'minecraft:lit_blast_furnace'
    },
    'minecraft:smoker': {
        station: 'smoking',
        unlitIdentifier: 'minecraft:smoker',
        litIdentifier: 'minecraft:lit_smoker'
    },
    'minecraft:lit_smoker': {
        station: 'smoking',
        unlitIdentifier: 'minecraft:smoker',
        litIdentifier: 'minecraft:lit_smoker'
    }
};

/**
 * Whether a block is a furnace, blast furnace or smoker, lit or not.
 *
 * @param identifier - The block's identifier.
 */
export const isCookingStation = (identifier: string): boolean => COOKERS[identifier] !== undefined;

/** The furnace's result slot, which Java's `FurnaceResultSlot` pays experience out of. */
export const FURNACE_RESULT_SLOT = 2;

/**
 * The content record field holding how many times each recipe finished since experience was
 * last paid out, by recipe id: Java's `AbstractFurnaceBlockEntity.recipesUsed`. Bedrock keeps a
 * single `StoredXPInt` instead, which cannot round each recipe's fraction the way Java does.
 *
 * @javaSee AbstractFurnaceBlockEntity.recipesUsed
 */
const RECIPES_USED_FIELD = 'recipesUsed';

/** The recipe tally a furnace's record holds, with anything that is not a count left out. */
const recipesUsedOf = (data: BlockEntityData): Record<string, number> => {
    const stored = data[RECIPES_USED_FIELD];
    if (!isRecord(stored)) return {};

    const used: Record<string, number> = {};
    for (const [id, count] of Object.entries(stored)) {
        if (typeof count === 'number' && Number.isInteger(count) && count > 0) used[id] = count;
    }
    return used;
};

/**
 * The experience a number of finished cooks of one recipe pays: the whole points, and one more
 * with the chance of the fraction left over, in Java's float arithmetic.
 *
 * @javaSource AbstractFurnaceBlockEntity.createExperience
 * @param count - How many times the recipe finished.
 * @param experience - The recipe's `experience`.
 * @param random - The chance of the extra point.
 * @returns The points, for one `ExperienceOrb.award`.
 */
export const cookingExperience = (count: number, experience: number, random: Random): number => {
    const total = Math.fround(Math.fround(count) * Math.fround(experience));
    let points = Math.floor(total);
    const fraction = Math.fround(total - points);
    if (fraction !== 0 && random() < fraction) points++;
    return points;
};

/** What a player taking from a furnace's result slot is paid, and the record left behind. */
export interface FurnaceExperience {
    /** One payout per recipe the furnace finished, each for its own `ExperienceOrb.award`. */
    readonly payouts: readonly number[];
    /** The block entity's record with its tally cleared. */
    readonly data: BlockEntityData;
}

/**
 * Pays out everything a furnace has cooked since it last paid, as Java does when a player takes
 * any part of the result stack.
 *
 * A recipe the server no longer knows pays nothing, as Java's `RecipeManager.byKey` lookup
 * skips it, and the tally is cleared either way.
 *
 * @javaSource AbstractFurnaceBlockEntity.getRecipesToAwardAndPopExperience
 * @javaSee RecipeManager.byKey
 * @param content - The recipes the tally names.
 * @param data - The furnace's block entity record.
 * @param random - The chance of each recipe's extra point.
 * @returns The payouts and the cleared record, or undefined when the furnace owes nothing.
 */
export const takeFurnaceExperience = (
    content: ServerContent,
    data: BlockEntityData,
    random: Random
): FurnaceExperience | undefined => {
    if (data[RECIPES_USED_FIELD] === undefined) return undefined;

    const payouts: number[] = [];
    for (const [id, count] of Object.entries(recipesUsedOf(data))) {
        const recipe = content.recipes.get(id);
        if (recipe === undefined || !('experience' in recipe)) continue;
        payouts.push(cookingExperience(count, recipe.experience, random));
    }

    const { [RECIPES_USED_FIELD]: _cleared, ...rest } = data;
    return { payouts, data: rest };
};

/**
 * The `ContainerSetDataPacket` property a cooking screen draws its progress arrow from: how
 * many ticks the current item has cooked.
 *
 * The three ids are the furnace screen's own, and the packet documents that an id means
 * whatever the open container says it means. A client divides this by a cook total it holds
 * itself - 200 ticks for a furnace, 100 for a blast furnace or smoker - rather than by the
 * `CookTimeTotal` the block entity carries, so the total is not sent.
 */
export const FURNACE_DATA_COOK_TICKS = 0;

/** The property holding how much of the burning fuel is left, which is the flame's height. */
export const FURNACE_DATA_BURN_REMAINING = 1;

/** The property holding what that fuel started with, which the flame is a fraction of. */
export const FURNACE_DATA_BURN_DURATION = 2;

/**
 * What a cooking screen has to be told after a tick, by property id.
 *
 * @param source - The current furnace entity or its serialized block entity.
 * @returns The three furnace properties, for a caller to send to whoever is watching.
 */
export const furnaceScreenData = (source: Furnace | NBTTagCompound): ReadonlyMap<number, number> => {
    const values: readonly [number, number, number] =
        source instanceof Furnace
            ? [source.getCookTime(), source.getBurnTime(), source.getBurnDuration()]
            : [source.getShort('CookTime', 0), source.getShort('BurnTime', 0), source.getShort('BurnDuration', 0)];

    return new Map<number, number>([
        [FURNACE_DATA_COOK_TICKS, values[0]],
        [FURNACE_DATA_BURN_REMAINING, values[1]],
        [FURNACE_DATA_BURN_DURATION, values[2]]
    ]);
};

/** Java's `AbstractFurnaceBlockEntity` input and fuel slots. */
const INPUT_SLOT = 0;
const FUEL_SLOT = 1;
const OUTPUT_SLOT = FURNACE_RESULT_SLOT;

/** Whether a loaded furnace has the input and fuel stacks required to leave the idle state. */
const hasInputAndFuel = (furnace: Furnace): boolean => {
    let hasInput = false;
    let hasFuel = false;
    let index = 0;
    for (const item of furnace.getItems()) {
        if (!(item instanceof NBTTagCompound)) continue;
        const itemSlot = item.getByte('Slot', index);
        index++;
        if (item.getString('Name', '') === '' || item.getByte('Count', 0) <= 0) continue;
        if (itemSlot === INPUT_SLOT) hasInput = true;
        else if (itemSlot === FUEL_SLOT) hasFuel = true;
        if (hasInput && hasFuel) return true;
    }

    return false;
};

/** The speed multiplier every vanilla fuel names, Java's `minecraft:cooking/speed_default`. */
const VANILLA_FUEL_SPEED = 'minecraft:cooking/speed_default';

/** One cooker update and the block identifier that represents its resulting burn state. */
export interface FurnaceTick {
    /** The complete block entity after its timers and inventory advance. */
    readonly tags: NBTTagCompound;
    /** The block variant to use after the fuel timer advances. */
    readonly blockIdentifier: string;
    /** The input, fuel, and output slots whose stacks changed, in slot order; empty for none. */
    readonly changedSlots: readonly number[];
}

/** Resolves a Bedrock item identifier and metadata to the Java item a recipe names. */
const javaItemIdOf = (identifier: string, meta = 0): string | undefined => {
    const row = itemTypesTable.items[identifier];
    if (row === undefined) return identifier.startsWith('minecraft:') ? undefined : identifier;

    const merged = row.merged?.find((variant) => variant.data === meta);
    if (merged !== undefined) return merged.java;
    if (row.merged !== undefined && row.data !== undefined && row.data !== meta) return undefined;
    if (row.merged !== undefined && row.data === undefined && meta !== 0) return undefined;

    return row.java;
};

/** The Bedrock stack a Java cooking recipe produces, if its result maps. */
const outputOf = (content: ServerContent, javaId: string, count: number): ItemDrop | undefined => {
    const mapped = javaItemToBedrock(javaId);
    if (mapped.kind === 'unknown') return undefined;

    const identifier = mapped.bedrock.identifier;
    const runtimeId = content.items.registry.idOf(identifier);
    const maxStackSize = runtimeId === undefined ? 64 : (content.items.facts.maxStackSize[runtimeId] ?? 64);

    return count > 0 && count <= maxStackSize
        ? {
              identifier,
              count,
              ...(mapped.bedrock.data === undefined ? {} : { meta: mapped.bedrock.data })
          }
        : undefined;
};

/** Whether one result can join the output slot without exceeding the item's stack size. */
const fitsOutput = (content: ServerContent, held: ItemDrop | undefined, result: ItemDrop): boolean => {
    if (held === undefined) return true;
    if (held.identifier !== result.identifier || (held.meta ?? 0) !== (result.meta ?? 0)) return false;

    const runtimeId = content.items.registry.idOf(result.identifier);
    const maxStackSize = runtimeId === undefined ? 64 : (content.items.facts.maxStackSize[runtimeId] ?? 64);
    return held.count + result.count <= maxStackSize;
};

/**
 * Advances one active furnace-style block entity by a game tick.
 *
 * @param content - The item and recipe registries this world is running.
 * @param furnace - The block entity carrying its current burn and cook timers.
 * @param identifier - The block state at the block entity's position.
 * @returns Updated tags and lit variant, or undefined for a non-cooking block.
 */
export const tickFurnace = (
    content: ServerContent,
    furnace: BlockEntity,
    identifier: string
): FurnaceTick | undefined => {
    const cooker = COOKERS[identifier];
    if (cooker === undefined) return undefined;

    if (
        furnace instanceof Furnace &&
        identifier === cooker.unlitIdentifier &&
        furnace.getBurnTime() === 0 &&
        furnace.getCookTime() === 0 &&
        !hasInputAndFuel(furnace)
    ) {
        // Nothing in this state can advance. Avoid serializing and rebuilding an idle inventory
        // just to normalize its NBT layout on the first tick after load.
        return undefined;
    }

    const tags = furnace.toNBT();
    const record = blockEntityRecord(tags);
    const items: (ItemDrop | undefined)[] = [...(record.items ?? [])];
    const input = items[0];
    const fuel = items[1];
    const output = items[2];
    let burnTime = tags.getShort('BurnTime', 0);
    const inputId = input === undefined ? undefined : javaItemIdOf(input.identifier, input.meta);
    const matched =
        input !== undefined && inputId !== undefined && (burnTime > 0 || fuel !== undefined)
            ? content.recipes.match({ station: cooker.station, item: { id: inputId, count: input.count } })
            : undefined;
    const result = matched === undefined ? undefined : outputOf(content, matched.result.id, matched.result.count);
    const canCook = matched !== undefined && result !== undefined && fitsOutput(content, output, result);

    const context = cooker.station === 'smelting' ? DEFAULT_PROVIDER_CONTEXT : FAST_COOKING_CONTEXT;
    let cookTicks = tags.getShort('CookTime', 0);
    let burnDuration = tags.getShort('BurnDuration', 0);
    const changedSlots: number[] = [];
    let recipesUsed: Record<string, number> | undefined;
    if (burnTime > 0) burnTime--;

    if (burnTime === 0 && canCook && fuel !== undefined) {
        const fuelType = content.items.types.get(fuel.identifier);
        const fuelTime = fuelType === undefined ? 0 : burnTimeOf(fuelType, context);

        if (fuelTime > 0) {
            burnTime = fuelTime;
            burnDuration = fuelTime;
            const fuelId = javaItemIdOf(fuel.identifier, fuel.meta);
            if (fuel.count > 1) items[1] = { ...fuel, count: fuel.count - 1 };
            else if (fuelId === 'minecraft:lava_bucket') items[1] = { identifier: 'minecraft:bucket', count: 1 };
            else items[1] = undefined;
            changedSlots.push(FUEL_SLOT);
        }
    }

    if (burnTime > 0 && canCook && matched !== undefined && result !== undefined) {
        // Java's `getTotalCookTime`: the recipe's time over the burning fuel's speed multiplier,
        // which is 2 in a smoker or a blast furnace. An empty fuel slot leaves the vanilla fuels'
        // multiplier, which every vanilla fuel shares.
        const fuelType = fuel === undefined ? undefined : content.items.types.get(fuel.identifier);
        const speed =
            fuelType === undefined
                ? evaluateNumberProvider(VANILLA_FUEL_SPEED, context)
                : speedMultiplierOf(fuelType, context);
        const cookingTime = matched.cookingTime ?? 200;
        const requiredCookTicks = Math.max(1, speed > 0 ? Math.ceil(cookingTime / speed) : cookingTime);
        tags.addValue('CookTimeTotal', new Types.ShortVal(requiredCookTicks));
        cookTicks++;

        if (cookTicks >= requiredCookTicks) {
            items[0] = input !== undefined && input.count > 1 ? { ...input, count: input.count - 1 } : undefined;
            items[2] = output === undefined ? result : { ...output, count: output.count + result.count };
            cookTicks = 0;
            changedSlots.push(INPUT_SLOT, OUTPUT_SLOT);
            // Java's `setRecipeUsed`: the experience is paid when a player takes the result.
            const used = recipesUsedOf(record);
            used[matched.recipe.id] = (used[matched.recipe.id] ?? 0) + 1;
            recipesUsed = used;
        }
    } else {
        cookTicks = Math.max(0, cookTicks - 2);
    }

    applyBlockEntityRecord(tags, {
        ...record,
        items,
        ...(recipesUsed === undefined ? {} : { [RECIPES_USED_FIELD]: recipesUsed })
    });
    tags.addValue('BurnTime', new Types.ShortVal(burnTime));
    tags.addValue('CookTime', new Types.ShortVal(cookTicks));
    if (burnDuration > 0) tags.addValue('BurnDuration', new Types.ShortVal(burnDuration));

    return {
        tags,
        blockIdentifier: burnTime > 0 ? cooker.litIdentifier : cooker.unlitIdentifier,
        changedSlots: changedSlots.sort((a, b) => a - b)
    };
};
