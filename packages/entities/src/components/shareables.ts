import type { ComponentFactory, ParseResult } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';

import type { EntityHooks } from '../hooks';
import { isRecord } from './schemas';

/** One item name or tag and the pickup and sharing rules attached to it. */
export interface ShareableItemParams {
    /** Names or Bedrock item tags that match this rule. */
    readonly items: readonly string[];
    /** Lower values win when the entity chooses among dropped items. */
    readonly priority: number;
    /** Maximum matching items the entity keeps, or -1 for no limit. */
    readonly maxAmount: number;
    /** Maximum matching items taken in one pickup. */
    readonly pickupLimit: number;
    /** The amount considered surplus when the entity shares items. */
    readonly surplusAmount: number;
    /** The amount the entity wants when sharing items. */
    readonly wantAmount: number;
    readonly admire: boolean;
    readonly barter: boolean;
    readonly consumeItem: boolean;
    readonly pickupOnly: boolean;
    readonly storedInInventory: boolean;
    readonly craftInto: string | undefined;
}

/** The item rules and fallback settings declared by `minecraft:shareables`. */
export interface ShareablesParams {
    /** Whether unmatched items are accepted as the lowest priority group. */
    readonly allItems: boolean;
    readonly allItemsMaxAmount: number;
    readonly allItemsSurplusAmount: number;
    readonly allItemsWantAmount: number;
    /** Rules in source order; the first matching rule shadows later matches. */
    readonly items: readonly ShareableItemParams[];
    /** Whether the entity may pick up another stack of an item it already holds. */
    readonly singularPickup: boolean;
}

const namesAt = (value: unknown): readonly string[] | undefined => {
    if (typeof value === 'string' && value.length > 0) return [value];
    if (Array.isArray(value) && value.every((name) => typeof name === 'string' && name.length > 0)) return value;
    if (!isRecord(value)) return undefined;

    const names: string[] = [];
    for (const [name, enabled] of Object.entries(value)) {
        if (enabled === true) names.push(name);
        else if (typeof enabled === 'string' && enabled.length > 0) names.push(enabled);
        else if (enabled !== false) return undefined;
    }
    return names.length > 0 ? names : undefined;
};

const integerAt = (
    body: Record<string, unknown>,
    key: string,
    fallback: number,
    minimum: number
): number | undefined => {
    const value = body[key];
    if (value === undefined) return fallback;
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum ? value : undefined;
};

const booleanAt = (body: Record<string, unknown>, key: string, fallback: boolean): boolean | undefined => {
    const value = body[key];
    if (value === undefined) return fallback;
    return typeof value === 'boolean' ? value : undefined;
};

const shareableItemAt = (value: unknown): ParseResult<ShareableItemParams> => {
    if (!isRecord(value)) return rejected('each item must be an object');

    const items = namesAt(value.item);
    if (items === undefined) return rejected('item must name one or more items or tags');

    const priority = integerAt(value, 'priority', 0, 0);
    const maxAmount = integerAt(value, 'max_amount', -1, -1);
    const pickupLimit = integerAt(value, 'pickup_limit', -1, -1);
    const surplusAmount = integerAt(value, 'surplus_amount', -1, -1);
    const wantAmount = integerAt(value, 'want_amount', -1, -1);
    const admire = booleanAt(value, 'admire', false);
    const barter = booleanAt(value, 'barter', false);
    const consumeItem = booleanAt(value, 'consume_item', false);
    const pickupOnly = booleanAt(value, 'pickup_only', false);
    const storedInInventory = booleanAt(value, 'stored_in_inventory', false);
    if (
        priority === undefined ||
        maxAmount === undefined ||
        pickupLimit === undefined ||
        surplusAmount === undefined ||
        wantAmount === undefined ||
        admire === undefined ||
        barter === undefined ||
        consumeItem === undefined ||
        pickupOnly === undefined ||
        storedInInventory === undefined
    )
        return rejected('shareable item values have the wrong type or range');
    if (value.craft_into !== undefined && typeof value.craft_into !== 'string')
        return rejected('craft_into must be a string');

    return accepted({
        items,
        priority,
        maxAmount,
        pickupLimit,
        surplusAmount,
        wantAmount,
        admire,
        barter,
        consumeItem,
        pickupOnly,
        storedInInventory,
        craftInto: typeof value.craft_into === 'string' ? value.craft_into : undefined
    });
};

/** `minecraft:shareables`, which describes the items an entity picks up or shares. */
export const shareables: ComponentFactory<EntityHooks, ShareablesParams> = {
    name: 'minecraft:shareables',
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        if (value.items !== undefined && !Array.isArray(value.items)) return rejected('items must be an array');

        const allItems = booleanAt(value, 'all_items', false);
        const allItemsMaxAmount = integerAt(value, 'all_items_max_amount', -1, -1);
        const allItemsSurplusAmount = integerAt(value, 'all_items_surplus_amount', -1, -1);
        const allItemsWantAmount = integerAt(value, 'all_items_want_amount', -1, -1);
        const singularPickup = booleanAt(value, 'singular_pickup', false);
        if (
            allItems === undefined ||
            allItemsMaxAmount === undefined ||
            allItemsSurplusAmount === undefined ||
            allItemsWantAmount === undefined ||
            singularPickup === undefined
        )
            return rejected('shareables values have the wrong type or range');

        const items: ShareableItemParams[] = [];
        for (const entry of Array.isArray(value.items) ? value.items : []) {
            const parsed = shareableItemAt(entry);
            if (!parsed.ok) return parsed;
            items.push(parsed.value);
        }

        return accepted({
            allItems,
            allItemsMaxAmount,
            allItemsSurplusAmount,
            allItemsWantAmount,
            items,
            singularPickup
        });
    },
    create: () => ({})
};

/** Whether a parsed `minecraft:shareables` value has its normalized shape. */
export const isShareablesParams = (value: unknown): value is ShareablesParams => {
    if (!isRecord(value) || typeof value.allItems !== 'boolean' || typeof value.singularPickup !== 'boolean')
        return false;
    if (
        !Number.isSafeInteger(value.allItemsMaxAmount) ||
        !Number.isSafeInteger(value.allItemsSurplusAmount) ||
        !Number.isSafeInteger(value.allItemsWantAmount) ||
        !Array.isArray(value.items)
    )
        return false;
    return value.items.every(
        (entry) =>
            isRecord(entry) &&
            Array.isArray(entry.items) &&
            entry.items.every((name) => typeof name === 'string') &&
            Number.isSafeInteger(entry.priority) &&
            Number.isSafeInteger(entry.maxAmount) &&
            Number.isSafeInteger(entry.pickupLimit) &&
            Number.isSafeInteger(entry.surplusAmount) &&
            Number.isSafeInteger(entry.wantAmount) &&
            typeof entry.admire === 'boolean' &&
            typeof entry.barter === 'boolean' &&
            typeof entry.consumeItem === 'boolean' &&
            typeof entry.pickupOnly === 'boolean' &&
            typeof entry.storedInInventory === 'boolean'
    );
};
