/**
 * The catalog a level's scripts read their block, item, enchantment and potion types from: what
 * the pinned Bedrock Dedicated Server's Script API reported for each vanilla type
 * (`@jsprismarine/bedrock-data/script-catalog`), and the server's content for a type a pack adds,
 * which BDS's tables cannot know.
 */
import {
    scriptBlockFacts,
    scriptBlockLiquidFlow,
    scriptBlockStates,
    scriptBlockTypes,
    scriptEnchantments,
    scriptItems,
    scriptPotionData,
    scriptPotionDeliveries,
    scriptPotionEffects,
    scriptPotionStacks
} from '@jsprismarine/bedrock-data/script-catalog';
import { liquidDetection } from '@jsprismarine/blocks/components';
import type {
    ScriptBlockTypeInfo,
    ScriptCatalog,
    ScriptItemInfo,
    ScriptLegacyStates,
    ScriptWaterAnswers
} from '@jsprismarine/script-host/host/world';

import type { ServerContent } from '../../content/ServerContent';

/** What a pack block's own definition says of it, which the catalog answers its scripts with. */
export interface CatalogBlockFacts {
    /** How water treats the block, from its `minecraft:liquid_detection`. */
    readonly water: ScriptWaterAnswers;
    /** Whether anything collides with the block, from its `minecraft:collision_box`. */
    readonly solid: boolean;
}

/** What water does to a block that declares no `minecraft:liquid_detection`: it is kept out. */
const DRY: ScriptWaterAnswers = { contain: false, blocking: true, destroyed: false, spawns: false };

/**
 * What a pack block's definition says of it, in its default state: its water rule and whether it
 * collides. A rule that pops the block drops its loot, which the Script API calls a spawn.
 * @param content - The server's content.
 * @param typeId - The block type.
 * @returns The facts, or undefined for a type the content does not have.
 */
export const packBlockFacts = (content: ServerContent, typeId: string): CatalogBlockFacts | undefined => {
    const type = content.blocks.types.get(typeId);
    if (type === undefined) return undefined;
    const state = type.state();
    const rule = state.content.params(liquidDetection)?.detectionRules.find((each) => each.liquidType === 'water');
    return {
        water:
            rule === undefined
                ? DRY
                : {
                      contain: rule.canContainLiquid,
                      blocking: rule.onLiquidTouches === 'blocking',
                      destroyed: rule.onLiquidTouches === 'broken' || rule.onLiquidTouches === 'popped',
                      spawns: rule.onLiquidTouches === 'popped'
                  },
        solid: content.blocks.table.solid[state.runtimeId] === 1
    };
};

/** What the catalog reads of the server's content: the ids of its block and item types. */
export interface CatalogContent {
    blockTypes(): Iterable<string>;
    itemTypes(): Iterable<string>;
    /** What a pack block's definition says of it; left out, every pack block answers as solid and dry. */
    blockFacts?(typeId: string): CatalogBlockFacts | undefined;
}

const BLOCK_TYPES = new Map(scriptBlockTypes.map((row) => [row.id, row]));
const BLOCK_FACTS = new Map(scriptBlockFacts.map((row) => [row.id, row]));
const LIQUID_FLOW = new Map(scriptBlockLiquidFlow.map((row) => [row.id, row.permutations]));
const ITEMS = new Map(scriptItems.map((row) => [row.id, row]));

/** A block type the vanilla tables describe, joined from the permutation and placed-block tables. */
const vanillaBlock = (id: string): ScriptBlockTypeInfo | undefined => {
    const type = BLOCK_TYPES.get(id);
    if (type === undefined) return undefined;
    const facts = BLOCK_FACTS.get(id);
    const flow = LIQUID_FLOW.get(id);
    return {
        localizationKey: type.localizationKey,
        tags: type.tags,
        item: type.item,
        water: type.water,
        waterPermutations: type.waterPermutations,
        ...(flow === undefined ? {} : { liquidFlowStops: flow }),
        liquid: facts?.liquid ?? false,
        air: facts?.air ?? false,
        solid: facts?.solid ?? true,
        ...(facts === undefined ? {} : { mapColor: facts.mapColor }),
        components: facts?.components ?? [],
        ...(facts?.movable === undefined ? {} : { movable: facts.movable }),
        ...(facts?.precipitation === undefined ? {} : { precipitation: facts.precipitation }),
        ...(facts?.mapColorComponent === undefined ? {} : { mapColorComponent: facts.mapColorComponent }),
        ...(facts?.vibration === undefined ? {} : { vibration: facts.vibration })
    };
};

/**
 * A block type only the server's content has, which BDS's tables cannot describe. Its water
 * answers and solidity come from its own definition when the content can say; otherwise, and for
 * everything no scenario has recorded of a pack's block yet, it answers as a plain solid block
 * that gives itself and keeps water out.
 */
const customBlock = (id: string, facts: CatalogBlockFacts | undefined): ScriptBlockTypeInfo => ({
    localizationKey: `tile.${id}.name`,
    tags: [],
    item: id,
    water: facts?.water ?? DRY,
    waterPermutations: [],
    liquid: false,
    air: false,
    solid: facts?.solid ?? true,
    components: []
});

/** An item type only the server's content has, which answers as a plain stackable item until a scenario records one. */
const customItem = (id: string): ScriptItemInfo => ({
    localizationKey: `item.${id}.name`,
    maxAmount: 64,
    stackable: true,
    weight: 1,
    tags: [],
    components: []
});

/** The ids of a table followed by the content's ids it lacks, each once. */
const merged = (vanilla: Iterable<string>, content: Iterable<string>): string[] => {
    const ids = new Set(vanilla);
    for (const id of content) ids.add(id);
    return [...ids];
};

/**
 * The catalog of a server's content.
 * @param content - The server's block and item types.
 */
export const levelCatalog = (content: CatalogContent): ScriptCatalog => ({
    blockTypes: () => merged(BLOCK_TYPES.keys(), content.blockTypes()),
    blockType: (typeId) => {
        const vanilla = vanillaBlock(typeId);
        if (vanilla !== undefined) return vanilla;
        for (const id of content.blockTypes()) if (id === typeId) return customBlock(id, content.blockFacts?.(id));
        return undefined;
    },
    blockStates: () => scriptBlockStates,
    itemTypes: () => merged(ITEMS.keys(), content.itemTypes()),
    itemType: (typeId) => {
        const vanilla = ITEMS.get(typeId);
        if (vanilla !== undefined) return vanilla;
        for (const id of content.itemTypes()) if (id === typeId) return customItem(id);
        return undefined;
    },
    enchantments: () => scriptEnchantments,
    potionEffects: () => scriptPotionEffects,
    potionDeliveries: () => scriptPotionDeliveries,
    potionItem: (effect, delivery) => {
        const item = scriptPotionStacks.find((row) => row.effect === effect && row.delivery === delivery)?.item;
        if (item === undefined) return undefined;
        const data = scriptPotionData.find((row) => row.item === item && row.effect === effect)?.data;
        return data === undefined ? undefined : { typeId: item, data };
    },
    potionOf: (typeId, data) => {
        const row = scriptPotionData.find((each) => each.item === typeId && each.data === data);
        return row?.effect === null || row?.delivery === null || row === undefined
            ? undefined
            : { effect: row.effect, delivery: row.delivery };
    }
});

/**
 * The states BDS's Script API reports for a block type, from the pinned server's capture, or
 * undefined for a type it did not report. See `ScriptWorld.legacyStates`.
 */
export const legacyStatesOf = (typeId: string): ScriptLegacyStates | undefined => {
    const row = BLOCK_TYPES.get(typeId);
    if (row?.states === undefined) return undefined;
    const follows = Object.fromEntries(
        Object.entries(row.stateRelations ?? {}).map(([name, relation]) => [name, relation.follows ?? []])
    );
    return { defaults: row.states, follows };
};
