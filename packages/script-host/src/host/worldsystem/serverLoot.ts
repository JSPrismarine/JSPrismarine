/**
 * `world.getLootTableManager()`: the behavior pack's loot tables as objects, and the loot rolled
 * from a table, a block or an entity.
 *
 * A loot object carries the path of the table it was read from and where it sits in the table's
 * JSON, and reads the JSON again each time a member runs, so it costs nothing until a script
 * looks. The `loot-tables` scenario recorded how BDS turns the JSON into objects: a pool's rolls
 * and bonus rolls are ranges, a number `n` reading as `n` to `n`; an entry's weight is 1 unless
 * the JSON gives one; an entry whose JSON holds `pools` of its own has them as a `LootTableEntry`
 * sub-table of path `''`; each function and condition is an object of the class its name maps
 * to, and a condition without a class is left out.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { isRecord } from '../../isRecord';
import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import type { ScriptValue } from '../../values';
import { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';
import { blockKeyOf, entityKeyOf, itemOf, itemState, permutationOf, SERVER, TAG } from '../serverObjects';
import type { ScriptItem } from '../world';
import { worldSystemOf } from './serverWorld';
import { WORLD_TAG } from './tags';

/** Where a loot object sits: the table's path, and the keys from the table's JSON down to it. */
interface LootPointer {
    readonly path: string;
    readonly at: readonly (string | number)[];
}

/** The class each loot function's name maps to, with or without its `minecraft:` namespace. */
const FUNCTIONS: Readonly<Record<string, string>> = {
    set_count: 'SetItemCountFunction',
    furnace_smelt: 'SmeltItemFunction',
    looting_enchant: 'LootingEnchantFunction',
    enchant_random_gear: 'EnchantRandomEquipmentFunction',
    enchant_randomly: 'EnchantRandomlyFunction',
    enchant_with_levels: 'EnchantWithLevelsFunction',
    set_banner_details: 'SetBannerDetailsFunction',
    set_potion: 'SetPotionFunction',
    set_armor_trim: 'SetArmorTrimFunction',
    specific_enchants: 'SpecificEnchantFunction',
    exploration_map: 'ExplorationMapFunction',
    random_aux_value: 'RandomAuxValueFunction',
    random_block_state: 'RandomBlockStateFunction',
    random_dye: 'RandomDyeFunction',
    set_ominous_bottle_amplifier: 'SetOminousBottleFunction',
    set_damage: 'SetItemDamageFunction',
    set_data: 'SetItemDataFunction',
    set_data_from_color_index: 'SetDataFromColorIndexFunction',
    set_lore: 'SetItemLoreFunction',
    set_name: 'SetItemNameFunction',
    set_book_contents: 'SetBookContentsFunction',
    set_spawn_egg: 'SetSpawnEggFunction',
    set_stew_effect: 'SetStewEffectFunction',
    fill_container: 'FillContainerFunction',
    explosion_decay: 'ExplosionDecayFunction',
    copy_block_state: 'CarryOverBlockEntityDataFunction'
};

/** The class each loot condition's name maps to. A condition with none is left out, as on BDS. */
const CONDITIONS: Readonly<Record<string, string>> = {
    killed_by_player: 'KilledByPlayerCondition',
    killed_by_player_or_pets: 'KilledByPlayerOrPetsCondition',
    killed_by_entity: 'KilledByEntityCondition',
    damaged_by_entity: 'DamagedByEntityCondition',
    entity_killed: 'EntityKilledCondition',
    passenger_of_entity: 'PassengerOfEntityCondition',
    is_baby: 'IsBabyCondition',
    has_variant: 'EntityHasVariantCondition',
    has_mark_variant: 'EntityHasMarkVariantCondition',
    random_chance: 'RandomChanceCondition',
    random_chance_with_looting: 'RandomChanceWithLootingCondition',
    random_difficulty_chance: 'RandomDifficultyChanceCondition',
    random_regional_difficulty_chance: 'RandomRegionalDifficultyChanceCondition',
    match_tool: 'MatchToolCondition'
};

/** The classes of an entry, by its JSON `type`. */
const ENTRIES: Readonly<Record<string, string>> = {
    item: 'LootItem',
    loot_table: 'LootTableReference',
    empty: 'EmptyLootItem'
};

/** The difficulties `RandomDifficultyChanceCondition.chances` lists, in its order. */
const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'] as const;

const withoutNamespace = (name: unknown): string => (typeof name === 'string' ? name.replace(/^minecraft:/, '') : '');

/** A `NumberRange` from a loot JSON number or `{ min, max }`, or `[min, max]` for an enchantment level. */
const rangeOf = (value: unknown, fallback = 0): { max: number; min: number } => {
    if (typeof value === 'number') return { max: value, min: value };
    if (Array.isArray(value))
        return { max: Number(value[1] ?? value[0] ?? fallback), min: Number(value[0] ?? fallback) };
    if (isRecord(value)) {
        const min = typeof value.min === 'number' ? value.min : fallback;
        const max = typeof value.max === 'number' ? value.max : min;
        return { max, min };
    }
    return { max: fallback, min: fallback };
};

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * Registers the loot table manager and the loot classes.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementLoot = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const system = () => worldSystemOf(host);
    const pointerOf = (call: ScriptCall): LootPointer => pointerIn(call.state);
    const pointerIn = (state: string): LootPointer => {
        // The host wrote every loot state with JSON.stringify.
        const parsed: unknown = state === '' ? undefined : JSON.parse(state);
        if (!isRecord(parsed) || typeof parsed.path !== 'string' || !Array.isArray(parsed.at)) {
            throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'loot object' });
        }
        return { path: parsed.path, at: parsed.at.filter((key) => typeof key === 'string' || typeof key === 'number') };
    };
    /** The JSON a loot object stands for. */
    const nodeOf = (call: ScriptCall): Readonly<Record<string, unknown>> => {
        const { path, at } = pointerOf(call);
        let node: unknown = system().lootTable(path);
        for (const key of at) node = isRecord(node) ? node[key] : Array.isArray(node) ? node[Number(key)] : undefined;
        return isRecord(node) ? node : {};
    };
    const make = (className: string, pointer: LootPointer): ScriptHandle =>
        host.create(className, WORLD_TAG.loot, JSON.stringify(pointer));
    const arrayOf = (values: readonly ScriptValue[]): ScriptHandle => {
        const array = host.engine.evaluate('[]');
        if (!(array instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
        values.forEach((value, index) => {
            host.engine.set(array, String(index), value);
            if (value instanceof ScriptHandle) host.engine.free(value);
        });
        return host.engine.release(array);
    };
    /** A list of loot objects under one key of a loot object's JSON, each of the class `classOf` names. */
    const objects = (call: ScriptCall, key: string, classOf: (node: unknown) => string | undefined): ScriptHandle => {
        const pointer = pointerOf(call);
        const made: ScriptHandle[] = [];
        listOf(nodeOf(call)[key]).forEach((node, index) => {
            const className = classOf(node);
            if (className !== undefined)
                made.push(make(className, { path: pointer.path, at: [...pointer.at, key, index] }));
        });
        return arrayOf(made);
    };
    const conditions = (call: ScriptCall): ScriptHandle =>
        objects(call, 'conditions', (node) =>
            isRecord(node) ? CONDITIONS[withoutNamespace(node.condition)] : undefined
        );
    const functions = (call: ScriptCall): ScriptHandle =>
        objects(call, 'functions', (node) =>
            isRecord(node) ? (FUNCTIONS[withoutNamespace(node.function)] ?? 'LootItemFunction') : undefined
        );
    const range = (key: string, fallback = 0) => ({
        get: (call: ScriptCall) => JSON.stringify(rangeOf(nodeOf(call)[key], fallback))
    });
    const text = (key: string, fallback = '') => ({
        get: (call: ScriptCall) => {
            const value = nodeOf(call)[key];
            return typeof value === 'string' ? value : fallback;
        }
    });
    const number = (key: string, fallback = 0) => ({
        get: (call: ScriptCall) => {
            const value = nodeOf(call)[key];
            return typeof value === 'number' ? value : fallback;
        }
    });
    const flag = (key: string) => ({ get: (call: ScriptCall) => nodeOf(call)[key] === true });
    const strings = (key: string) => ({
        get: (call: ScriptCall) => JSON.stringify(listOf(nodeOf(call)[key]).filter((each) => typeof each === 'string'))
    });
    const stacks = (items: readonly ScriptItem[] | undefined): ScriptValue =>
        items === undefined
            ? undefined
            : arrayOf(items.map((item) => host.create('ItemStack', TAG.itemStack, itemState(item))));
    /** The tool argument at an index, or undefined for none. */
    const toolOf = (call: ScriptCall, index: number): ScriptItem | undefined => {
        const tool = call.args[index];
        return tool instanceof ScriptHandle ? itemOf(call.stateOf(tool)) : undefined;
    };
    /**
     * The `EnchantInfo` list of a function or a condition. The class's members belong with the
     * enchantments, so each object carries its enchantment and level range as plain data.
     */
    const enchantInfos = (key: string) => ({
        get: (call: ScriptCall) =>
            arrayOf(
                listOf(nodeOf(call)[key])
                    .filter(isRecord)
                    .map((info) =>
                        host.create(
                            'EnchantInfo',
                            WORLD_TAG.loot,
                            JSON.stringify({ enchantment: String(info.id ?? ''), range: rangeOf(info.level, 1) })
                        )
                    )
            )
    });

    implementations
        .implement(SERVER, 'World', 'getLootTableManager', () =>
            host.instance('LootTableManager', WORLD_TAG.lootTableManager)
        )
        .implement(SERVER, 'LootTableManager', 'getLootTable', (call) => {
            const path = `loot_tables/${String(call.args[0])}.json`;
            if (system().lootTable(path) === undefined) return undefined;
            return host.engine.release(make('LootTable', { path, at: [] }));
        })
        .implement(SERVER, 'LootTableManager', 'generateLootFromTable', (call) => {
            const { path, at } = pointerIn(call.stateOf(call.args[0] ?? null));
            // A sub-table has no path of its own to roll by.
            if (at.length > 0) return stacks([]);
            return stacks(system().rollLootTable(path, toolOf(call, 1)));
        })
        .implement(SERVER, 'LootTableManager', 'generateLootFromBlockPermutation', (call) =>
            stacks(system().rollBlockLoot(permutationOf(call.stateOf(call.args[0] ?? null)), toolOf(call, 1)))
        )
        .implement(SERVER, 'LootTableManager', 'generateLootFromBlockType', (call) => {
            const typeId = call.stateOf(call.args[0] ?? null);
            const permutation = host.world.resolveBlock(typeId, {});
            return permutation === undefined ? undefined : stacks(system().rollBlockLoot(permutation, toolOf(call, 1)));
        })
        .implement(SERVER, 'LootTableManager', 'generateLootFromBlock', (call) => {
            const key = blockKeyOf(call.stateOf(call.args[0] ?? null));
            const permutation = host.world.block(key.dimension, key);
            if (permutation === undefined) return undefined;
            return stacks(
                system().rollBlockLoot(permutation, toolOf(call, 1), { dimension: key.dimension, location: key })
            );
        })
        .implement(SERVER, 'LootTableManager', 'generateLootFromEntity', (call) => {
            const { id, typeId } = entityKeyOf(call.stateOf(call.args[0] ?? null));
            const entity = host.world.entity(id);
            return stacks(
                system().rollEntityLoot(
                    typeId,
                    toolOf(call, 1),
                    entity === undefined ? undefined : { dimension: entity.dimension, location: entity.location }
                )
            );
        })
        .implement(SERVER, 'LootTableManager', 'generateLootFromEntityType', (call) =>
            stacks(system().rollEntityLoot(call.stateOf(call.args[0] ?? null), toolOf(call, 1)))
        )
        .implement(SERVER, 'LootTable', 'path', {
            get: (call) => {
                const { path, at } = pointerOf(call);
                return at.length > 0 ? '' : path;
            }
        })
        .implement(SERVER, 'LootTable', 'pools', {
            get: (call) => objects(call, 'pools', (node) => (isRecord(node) ? 'LootPool' : undefined))
        })
        .implement(SERVER, 'LootPool', 'rolls', range('rolls'))
        .implement(SERVER, 'LootPool', 'bonusRolls', range('bonus_rolls'))
        .implement(SERVER, 'LootPool', 'tiers', {
            get: (call) => {
                if (!isRecord(nodeOf(call).tiers)) return undefined;
                const { path, at } = pointerOf(call);
                return host.engine.release(make('LootPoolTiers', { path, at: [...at, 'tiers'] }));
            }
        })
        .implement(SERVER, 'LootPool', 'conditions', { get: conditions })
        .implement(SERVER, 'LootPool', 'entries', {
            get: (call) => objects(call, 'entries', (node) => (isRecord(node) ? ENTRIES[String(node.type)] : undefined))
        })
        .implement(SERVER, 'LootPoolTiers', 'initialRange', number('initial_range'))
        .implement(SERVER, 'LootPoolTiers', 'bonusRolls', number('bonus_rolls'))
        .implement(SERVER, 'LootPoolTiers', 'bonusChance', number('bonus_chance'))
        .implement(SERVER, 'LootPoolEntry', 'weight', {
            get: (call) => {
                const { at } = pointerOf(call);
                // A sub-table has no weight of its own.
                if (at.at(-1) === 'sub') return 0;
                const weight = nodeOf(call).weight;
                return typeof weight === 'number' ? weight : 1;
            }
        })
        .implement(SERVER, 'LootPoolEntry', 'quality', number('quality'))
        .implement(SERVER, 'LootPoolEntry', 'subTable', {
            get: (call) => {
                const { path, at } = pointerOf(call);
                if (at.at(-1) === 'sub' || !Array.isArray(nodeOf(call).pools)) return undefined;
                return host.engine.release(make('LootTableEntry', { path, at: [...at, 'sub'] }));
            }
        })
        .implement(SERVER, 'LootTableEntry', 'lootTable', {
            get: (call) => {
                const { path, at } = pointerOf(call);
                // The sub-table is the entry's own JSON, whose `pools` it reads, and has no path.
                return host.engine.release(make('LootTable', { path, at: at.slice(0, -1) }));
            }
        })
        .implement(SERVER, 'LootTableReference', 'path', text('name'))
        .implement(SERVER, 'LootItem', 'name', {
            get: (call) => {
                const name = nodeOf(call).name;
                return typeof name === 'string'
                    ? host.engine.release(host.create('ItemType', TAG.itemType, name))
                    : undefined;
            }
        })
        .implement(SERVER, 'LootItem', 'functions', { get: functions })
        .implement(SERVER, 'LootItem', 'conditions', { get: conditions })
        .implement(SERVER, 'LootItemFunction', 'conditions', { get: conditions })
        .implement(SERVER, 'SetItemCountFunction', 'count', range('count'))
        .implement(SERVER, 'LootingEnchantFunction', 'count', range('count'))
        .implement(SERVER, 'SetBannerDetailsFunction', 'type', number('type'))
        .implement(SERVER, 'SetBannerDetailsFunction', 'baseColor', text('base_color', 'white'))
        .implement(SERVER, 'SetBannerDetailsFunction', 'patterns', {
            // An array of interfaces, which the binding does not parse from JSON, so it is made here.
            get: (call) => {
                const made = host.engine.evaluate(
                    `(${JSON.stringify(listOf(nodeOf(call).patterns).filter(isRecord))})`
                );
                return made instanceof ScriptHandle ? host.engine.release(made) : made;
            }
        })
        .implement(SERVER, 'SetPotionFunction', 'id', text('id'))
        .implement(SERVER, 'SetArmorTrimFunction', 'material', text('material'))
        .implement(SERVER, 'SetArmorTrimFunction', 'pattern', text('pattern'))
        .implement(SERVER, 'SpecificEnchantFunction', 'enchantments', enchantInfos('enchants'))
        .implement(SERVER, 'ExplorationMapFunction', 'destination', text('destination'))
        .implement(SERVER, 'RandomAuxValueFunction', 'values', range('values'))
        .implement(SERVER, 'RandomBlockStateFunction', 'blockState', text('block_state'))
        .implement(SERVER, 'RandomBlockStateFunction', 'values', range('values'))
        .implement(SERVER, 'SetOminousBottleFunction', 'amplifier', range('amplifier'))
        .implement(SERVER, 'SetItemDamageFunction', 'damage', range('damage'))
        .implement(SERVER, 'SetItemDataFunction', 'data', range('data'))
        .implement(SERVER, 'SetItemLoreFunction', 'lore', strings('lore'))
        .implement(SERVER, 'SetItemNameFunction', 'name', text('name'))
        .implement(SERVER, 'SetBookContentsFunction', 'author', text('author'))
        .implement(SERVER, 'SetBookContentsFunction', 'title', text('title'))
        .implement(SERVER, 'SetBookContentsFunction', 'pages', strings('pages'))
        .implement(SERVER, 'SetSpawnEggFunction', 'id', text('id'))
        .implement(SERVER, 'SetStewEffectFunction', 'effects', {
            get: (call) =>
                JSON.stringify(
                    listOf(nodeOf(call).effects).flatMap((effect) =>
                        isRecord(effect) && typeof effect.id === 'number'
                            ? [effect.id]
                            : typeof effect === 'number'
                              ? [effect]
                              : []
                    )
                )
        })
        .implement(SERVER, 'FillContainerFunction', 'lootTable', text('loot_table'))
        .implement(SERVER, 'CarryOverBlockEntityDataFunction', 'dynamicProperties', flag('dynamic_properties'))
        .implement(SERVER, 'KilledByEntityCondition', 'entityType', text('entity_type'))
        .implement(SERVER, 'DamagedByEntityCondition', 'entityType', text('entity_type'))
        .implement(SERVER, 'EntityKilledCondition', 'entityType', text('entity_type'))
        .implement(SERVER, 'EntityHasVariantCondition', 'value', number('value'))
        .implement(SERVER, 'EntityHasMarkVariantCondition', 'value', number('value'))
        .implement(SERVER, 'PassengerOfEntityCondition', 'entityType', text('entity_type'))
        .implement(SERVER, 'RandomChanceCondition', 'chance', number('chance'))
        .implement(SERVER, 'RandomChanceWithLootingCondition', 'chance', number('chance'))
        .implement(SERVER, 'RandomChanceWithLootingCondition', 'lootingMultiplier', number('looting_multiplier'))
        .implement(SERVER, 'RandomDifficultyChanceCondition', 'chances', {
            get: (call) => {
                const node = nodeOf(call);
                const fallback = typeof node.default_chance === 'number' ? node.default_chance : 0;
                return JSON.stringify(
                    DIFFICULTIES.map((difficulty) => {
                        const chance = node[difficulty];
                        return typeof chance === 'number' ? chance : fallback;
                    })
                );
            }
        })
        .implement(SERVER, 'RandomRegionalDifficultyChanceCondition', 'maxChance', number('max_chance'))
        .implement(SERVER, 'MatchToolCondition', 'itemName', text('item'))
        .implement(SERVER, 'MatchToolCondition', 'count', range('count'))
        .implement(SERVER, 'MatchToolCondition', 'durability', range('durability'))
        .implement(SERVER, 'MatchToolCondition', 'enchantments', enchantInfos('enchantments'))
        .implement(SERVER, 'MatchToolCondition', 'itemTagsAll', strings('minecraft:match_tool_filter_all'))
        .implement(SERVER, 'MatchToolCondition', 'itemTagsAny', strings('minecraft:match_tool_filter_any'))
        .implement(SERVER, 'MatchToolCondition', 'itemTagsNone', strings('minecraft:match_tool_filter_none'));
};
