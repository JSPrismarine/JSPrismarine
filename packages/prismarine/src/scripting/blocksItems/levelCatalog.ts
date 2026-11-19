/**
 * The catalog a level's scripts read their block, item, enchantment and potion types from: what
 * the pinned Bedrock Dedicated Server's Script API reported for each vanilla type
 * (`@jsprismarine/bedrock-data/script-catalog`), and the server's content for a type a pack adds,
 * which BDS's tables cannot know.
 */
import {
    scriptBlockFacts,
    scriptBlockStates,
    scriptBlockTypes,
    scriptEnchantments,
    scriptItems,
    scriptPotionData,
    scriptPotionDeliveries,
    scriptPotionEffects,
    scriptPotionStacks
} from '@jsprismarine/bedrock-data/script-catalog';
import type { ScriptBlockTypeInfo, ScriptCatalog, ScriptItemInfo } from '@jsprismarine/script-host/host/world';

/** What the catalog reads of the server's content: the ids of its block and item types. */
export interface CatalogContent {
    blockTypes(): Iterable<string>;
    itemTypes(): Iterable<string>;
}

const BLOCK_TYPES = new Map(scriptBlockTypes.map((row) => [row.id, row]));
const BLOCK_FACTS = new Map(scriptBlockFacts.map((row) => [row.id, row]));
const ITEMS = new Map(scriptItems.map((row) => [row.id, row]));

/** A block type the vanilla tables describe, joined from the permutation and placed-block tables. */
const vanillaBlock = (id: string): ScriptBlockTypeInfo | undefined => {
    const type = BLOCK_TYPES.get(id);
    if (type === undefined) return undefined;
    const facts = BLOCK_FACTS.get(id);
    return {
        localizationKey: type.localizationKey,
        tags: type.tags,
        item: type.item,
        water: type.water,
        waterPermutations: type.waterPermutations,
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
 * A block type only the server's content has, which BDS's tables cannot describe. No scenario has
 * recorded a pack's own block yet, so it answers as a plain solid block that gives itself.
 */
const customBlock = (id: string): ScriptBlockTypeInfo => ({
    localizationKey: `tile.${id}.name`,
    tags: [],
    item: id,
    water: { contain: false, blocking: true, destroyed: false, spawns: false },
    waterPermutations: [],
    liquid: false,
    air: false,
    solid: true,
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
        for (const id of content.blockTypes()) if (id === typeId) return customBlock(id);
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
