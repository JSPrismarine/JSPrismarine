/**
 * What the pinned Bedrock Dedicated Server's Script API answers about its block, item,
 * enchantment and potion registries, as the dump pack recorded it
 * ([ADR 0019](../../../docs/adr/0019-bedrock-data-comes-from-bds.md)). A script host serves these
 * answers for the vanilla types, so a pack reads the same tags, localization keys, components and
 * limits on JSPrismarine as on BDS.
 *
 * Each table is a capture under `src/jsp/v<protocol>/bedrock/`, written by
 * `pnpm --filter @jsprismarine/bedrock-data run dump:bedrock --pass dump`.
 */
import blockFactsTable from './jsp/v2225/bedrock/block-facts.json';
import blockStatesTable from './jsp/v2225/bedrock/block-states.json';
import blockTypesTable from './jsp/v2225/bedrock/block-types.json';
import effectsTable from './jsp/v2225/bedrock/effects.json';
import enchantmentConflictsTable from './jsp/v2225/bedrock/enchantment-conflicts.json';
import enchantmentItemsTable from './jsp/v2225/bedrock/enchantment-items.json';
import enchantmentsTable from './jsp/v2225/bedrock/enchantments.json';
import itemsTable from './jsp/v2225/bedrock/items.json';
import potionDataTable from './jsp/v2225/bedrock/potion-data.json';
import potionDeliveriesTable from './jsp/v2225/bedrock/potion-deliveries.json';
import potionStacksTable from './jsp/v2225/bedrock/potion-stacks.json';
import potionsTable from './jsp/v2225/bedrock/potions.json';

/** A block state's value, as the Script API gives one. */
export type ScriptStateValue = string | number | boolean;

/** What water does to a permutation, by the four `LiquidType.Water` questions. */
export interface ScriptWaterAnswers {
    readonly contain: boolean;
    readonly blocking: boolean;
    readonly destroyed: boolean;
    readonly spawns: boolean;
}

/** A color with alpha, each part from 0 to 1. */
export interface ScriptRgba {
    readonly red: number;
    readonly green: number;
    readonly blue: number;
    readonly alpha: number;
}

/** One block type as its default permutation answers. */
export interface ScriptBlockTypeRow {
    readonly id: string;
    readonly localizationKey: string;
    readonly tags: readonly string[];
    /** The item `getItemStack` gives, or null for a block with none. */
    readonly item: string | null;
    readonly water: ScriptWaterAnswers;
    /** The permutations whose water answers differ from the default's. */
    readonly waterPermutations: readonly {
        readonly states: Readonly<Record<string, ScriptStateValue>>;
        readonly water: ScriptWaterAnswers;
    }[];
}

/** One block type as a placed block of its default permutation answers. */
export interface ScriptBlockFactsRow {
    readonly id: string;
    readonly solid: boolean;
    readonly liquid: boolean;
    readonly air: boolean;
    /** What `getMapColor` answered, in the biome the capture placed the block in. */
    readonly mapColor: ScriptRgba;
    /** The components the block has, by id. */
    readonly components: readonly string[];
    readonly movable?: { readonly movementType: string; readonly stickyType: string };
    readonly precipitation?: {
        readonly accumulatesSnow: boolean;
        readonly isSnowLoggable: boolean;
        readonly obstructsRain: boolean;
    };
    readonly mapColorComponent?: {
        readonly color: ScriptRgba;
        readonly tintedColor: ScriptRgba;
        readonly tintMethod: string;
    };
    readonly vibration?: { readonly dampens: boolean; readonly occludes: boolean };
}

/** One block state and the values the game declares for it. */
export interface ScriptBlockStateRow {
    readonly id: string;
    readonly validValues: readonly ScriptStateValue[];
}

/** One item type as a new stack of it answers. */
export interface ScriptItemRow {
    readonly id: string;
    readonly localizationKey: string;
    readonly maxAmount: number;
    readonly stackable: boolean;
    readonly weight: number;
    readonly tags: readonly string[];
    /** The components a new stack has, by id. */
    readonly components: readonly string[];
    readonly durability?: { readonly maxDurability: number; readonly damageChance: readonly number[] };
    readonly food?: {
        readonly nutrition: number;
        readonly saturationModifier: number;
        readonly canAlwaysEat: boolean;
        readonly usingConvertsTo: string;
    };
    readonly cooldown?: { readonly category: string; readonly ticks: number };
    /** The enchantment slots of the type, one entry each; the capture records each as null. */
    readonly enchantable?: { readonly slots: readonly unknown[] };
    readonly potion?: { readonly effect: string; readonly delivery: string };
    readonly dyeable?: {
        readonly defaultColor?: { readonly red: number; readonly green: number; readonly blue: number };
    };
    readonly compostable?: { readonly chance: number };
    readonly inventorySize?: number;
    readonly containerRules?: {
        readonly weightLimit?: number;
        readonly allowedItems: readonly string[];
        readonly bannedItems: readonly string[];
        readonly allowNestedStorageItems: boolean;
    } | null;
}

/** One enchantment, the items it goes on, and the enchantments it refuses beside it. */
export interface ScriptEnchantmentRow {
    readonly id: string;
    readonly maxLevel: number;
    readonly items: readonly string[];
    readonly conflicts: readonly string[];
}

/** One potion effect and how long a potion of it lasts, when it is timed. */
export interface ScriptPotionEffectRow {
    readonly effect: string;
    readonly durationTicks: number | null;
}

/** The item a data value of a potion item stands for, and the potion it holds. */
export interface ScriptPotionDataRow {
    readonly item: string;
    readonly data: number;
    readonly typeId: string | null;
    readonly effect: string | null;
    readonly delivery: string | null;
}

/** The item `Potions.resolve` makes for an effect and a delivery. */
export interface ScriptPotionStackRow {
    readonly effect: string;
    readonly delivery: string;
    readonly item: string;
}

// The capture writes each table with JSON.stringify from the rows the engine reported, in the
// shapes above; the JSON import's inferred literal types carry no more than that.
const rowsOf = <Row>(table: { readonly rows: readonly unknown[] }): readonly Row[] => table.rows as readonly Row[];

/** Every block type, as `BlockTypes.getAll` lists them. */
export const scriptBlockTypes: readonly ScriptBlockTypeRow[] = rowsOf(blockTypesTable);

/** What a placed block of each type answers. */
export const scriptBlockFacts: readonly ScriptBlockFactsRow[] = rowsOf(blockFactsTable);

/** Every block state, as `BlockStates.getAll` lists them. */
export const scriptBlockStates: readonly ScriptBlockStateRow[] = rowsOf(blockStatesTable);

/** Every item type, as `ItemTypes.getAll` lists them. */
export const scriptItems: readonly ScriptItemRow[] = rowsOf(itemsTable);

/** Every enchantment, as `EnchantmentTypes.getAll` lists them, with the items and conflicts of each. */
export const scriptEnchantments: readonly ScriptEnchantmentRow[] = (() => {
    const items = new Map(
        rowsOf<{ id: string; items: readonly string[] }>(enchantmentItemsTable).map((row) => [row.id, row.items])
    );
    const conflicts = new Map(
        rowsOf<{ id: string; conflicts: readonly string[] }>(enchantmentConflictsTable).map((row) => [
            row.id,
            row.conflicts
        ])
    );
    return rowsOf<{ id: string; maxLevel: number }>(enchantmentsTable).map((row) => ({
        id: row.id,
        maxLevel: row.maxLevel,
        items: items.get(row.id) ?? [],
        conflicts: conflicts.get(row.id) ?? []
    }));
})();

/** Every status effect's id, `minecraft:empty` among them, as `EffectTypes.getAll` lists them. */
export const scriptEffectTypes: readonly string[] = rowsOf<{ id: string }>(effectsTable).map((row) => row.id);

/** Every potion effect, as `Potions.getAllEffectTypes` lists them. */
export const scriptPotionEffects: readonly ScriptPotionEffectRow[] = rowsOf(potionsTable);

/** Every potion delivery, as `Potions.getAllDeliveryTypes` lists them. */
export const scriptPotionDeliveries: readonly string[] = rowsOf<{ id: string }>(potionDeliveriesTable).map(
    (row) => row.id
);

/** The item each effect and delivery makes. */
export const scriptPotionStacks: readonly ScriptPotionStackRow[] = rowsOf(potionStacksTable);

/** The potion each data value of a potion item holds. */
export const scriptPotionData: readonly ScriptPotionDataRow[] = rowsOf(potionDataTable);
