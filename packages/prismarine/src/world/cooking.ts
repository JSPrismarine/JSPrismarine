/** Server-side cooking for the furnace, blast furnace, and smoker block entities. */
import type { ItemDrop } from '@jsprismarine/block-behaviors';
import { burnTimeOf, DEFAULT_PROVIDER_CONTEXT, FAST_COOKING_CONTEXT, itemTypesTable } from '@jsprismarine/items';
import { javaItemToBedrock } from '@jsprismarine/mapping';
import { Types } from '@jsprismarine/nbt';
import type { NBTTagCompound } from '@jsprismarine/nbt';

import type { ServerContent } from '../content/ServerContent';
import type { BlockEntity } from '../blockentity/BlockEntity';
import { applyBlockEntityRecord, blockEntityRecord } from '../blockentity/contentRecord';

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

/** One cooker update and the block identifier that represents its resulting burn state. */
export interface FurnaceTick {
    /** The complete block entity after its timers and inventory advance. */
    readonly tags: NBTTagCompound;
    /** The block variant to use after the fuel timer advances. */
    readonly blockIdentifier: string;
    /** Whether an input, fuel, or output stack changed. */
    readonly inventoryChanged: boolean;
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

    const tags = furnace.toNBT();
    const record = blockEntityRecord(tags);
    const items: (ItemDrop | undefined)[] = [...(record.items ?? [])];
    const input = items[0];
    const fuel = items[1];
    const output = items[2];
    const inputId = input === undefined ? undefined : javaItemIdOf(input.identifier, input.meta);
    const matched =
        input !== undefined && inputId !== undefined
            ? content.recipes.match({ station: cooker.station, item: { id: inputId, count: input.count } })
            : undefined;
    const result = matched === undefined ? undefined : outputOf(content, matched.result.id, matched.result.count);
    const canCook = matched !== undefined && result !== undefined && fitsOutput(content, output, result);

    let burnTime = tags.getShort('BurnTime', 0);
    let cookTicks = tags.getShort('CookTime', 0);
    let burnDuration = tags.getShort('BurnDuration', 0);
    let inventoryChanged = false;
    if (burnTime > 0) burnTime--;

    if (burnTime === 0 && canCook && fuel !== undefined) {
        const fuelType = content.items.types.get(fuel.identifier);
        const fuelTime =
            fuelType === undefined
                ? 0
                : burnTimeOf(fuelType, cooker.station === 'smelting' ? DEFAULT_PROVIDER_CONTEXT : FAST_COOKING_CONTEXT);

        if (fuelTime > 0) {
            burnTime = fuelTime;
            burnDuration = fuelTime;
            const fuelId = javaItemIdOf(fuel.identifier, fuel.meta);
            if (fuel.count > 1) items[1] = { ...fuel, count: fuel.count - 1 };
            else if (fuelId === 'minecraft:lava_bucket') items[1] = { identifier: 'minecraft:bucket', count: 1 };
            else items[1] = undefined;
            inventoryChanged = true;
        }
    }

    if (burnTime > 0 && canCook && matched !== undefined && result !== undefined) {
        const requiredCookTicks = Math.max(1, matched.cookingTime ?? 200);
        tags.addValue('CookTimeTotal', new Types.ShortVal(requiredCookTicks));
        cookTicks++;

        if (cookTicks >= requiredCookTicks) {
            items[0] = input !== undefined && input.count > 1 ? { ...input, count: input.count - 1 } : undefined;
            items[2] = output === undefined ? result : { ...output, count: output.count + result.count };
            cookTicks = 0;
            inventoryChanged = true;
        }
    } else {
        cookTicks = Math.max(0, cookTicks - 2);
    }

    applyBlockEntityRecord(tags, { ...record, items });
    tags.addValue('BurnTime', new Types.ShortVal(burnTime));
    tags.addValue('CookTime', new Types.ShortVal(cookTicks));
    if (burnDuration > 0) tags.addValue('BurnDuration', new Types.ShortVal(burnDuration));

    return {
        tags,
        blockIdentifier: burnTime > 0 ? cooker.litIdentifier : cooker.unlitIdentifier,
        inventoryChanged
    };
};
