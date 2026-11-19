/**
 * The components a block object hands out, and the members of the ones whose answers are facts of
 * the block's type: `BlockMovableComponent`, `BlockMapColorComponent`,
 * `BlockPrecipitationInteractionsComponent` and `BlockVibrationPropertiesComponent`. A block has
 * the components its type's catalog entry lists; the inventory component also needs the world to
 * hold a container there.
 */
import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import type { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';
import { blockAt } from '../serverBlocks';
import type { BlockKey } from '../serverObjects';
import { blockKeyOf, plainError, SERVER, TAG, withNamespace } from '../serverObjects';
import type { ScriptBlockTypeInfo } from '../world';
import { blockComponentKeyOf } from './componentFacts';
import { BLOCK_ITEM_TAG } from './tags';

/** The class of each block component, by its id, as `BlockComponentTypes` lists them. */
const BLOCK_COMPONENTS: ReadonlyMap<string, string> = new Map([
    ['minecraft:dynamic_properties', 'BlockDynamicPropertiesComponent'],
    ['minecraft:entity_storage', 'BlockEntityStorageComponent'],
    ['minecraft:fluid_container', 'BlockFluidContainerComponent'],
    ['minecraft:instrument_sound', 'BlockInstrumentComponent'],
    ['minecraft:inventory', 'BlockInventoryComponent'],
    ['minecraft:map_color', 'BlockMapColorComponent'],
    ['minecraft:movable', 'BlockMovableComponent'],
    ['minecraft:piston', 'BlockPistonComponent'],
    ['minecraft:precipitation_interactions', 'BlockPrecipitationInteractionsComponent'],
    ['minecraft:recipe_crafting', 'BlockRecipeCraftingComponent'],
    ['minecraft:recipe_processing', 'BlockRecipeProcessingComponent'],
    ['minecraft:record_player', 'BlockRecordPlayerComponent'],
    ['minecraft:redstone_producer', 'BlockRedstoneProducerComponent'],
    ['minecraft:sign', 'BlockSignComponent'],
    ['minecraft:vibration_properties', 'BlockVibrationPropertiesComponent']
]);

/** The ids of the components a block has, in the catalog's order. */
const componentIds = (host: PackHost, key: BlockKey): string[] => {
    const { world } = host;
    const info = world.catalog?.blockType(blockAt(world, key).typeId);
    const listed = info?.components ?? [];
    const hasInventory = world.blockInventory?.(key.dimension, key) !== undefined;
    const ids = listed.filter((id) => BLOCK_COMPONENTS.has(id) && (id !== 'minecraft:inventory' || hasInventory));
    // A world without a catalog still has the containers it holds.
    if (hasInventory && !ids.includes('minecraft:inventory')) ids.push('minecraft:inventory');
    return ids;
};

/** A new component object of a block, which the caller releases or frees. */
const componentObject = (host: PackHost, key: BlockKey, id: string): ScriptHandle => {
    const block = JSON.stringify(key);
    if (id === 'minecraft:inventory') return host.create('BlockInventoryComponent', TAG.blockInventory, block);
    return host.create(BLOCK_COMPONENTS.get(id) ?? '', BLOCK_ITEM_TAG.blockComponent, JSON.stringify({ block, id }));
};

/**
 * The component a block has under an id, as `Block.getComponent` returns it, or undefined when
 * it has none. The caller releases it to return it, or frees it.
 */
export const blockComponent = (host: PackHost, key: BlockKey, id: string): ScriptHandle | undefined => {
    const full = withNamespace(id);
    return componentIds(host, key).includes(full) ? componentObject(host, key, full) : undefined;
};

/** Every component a block has, as `Block.getComponents` returns them, for an array to hold. */
export const blockComponents = (host: PackHost, key: BlockKey): ScriptHandle[] =>
    componentIds(host, key).map((id) => componentObject(host, key, id));

/** The block a component object belongs to: a key for the host's components, the inventory's own state otherwise. */
export const componentBlockState = (tag: number, state: string): string =>
    tag === BLOCK_ITEM_TAG.blockComponent ? (blockComponentKeyOf(state)?.block ?? state) : state;

/**
 * Registers the members of the block components whose answers are facts of the block's type.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementBlockComponents = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    /** The type facts of the block a component belongs to, or BDS's error once the block is gone. */
    const facts = (call: ScriptCall, member: string): ScriptBlockTypeInfo => {
        const key = blockKeyOf(componentBlockState(call.tag, call.state));
        const info = world.catalog?.blockType(blockAt(world, key).typeId);
        if (info === undefined) throw plainError(`Failed to get property '${member}'.`);
        return info;
    };
    const color = (value: unknown): string => JSON.stringify(value);
    implementations
        .implement(SERVER, 'BlockMovableComponent', 'movementType', {
            get: (call) => facts(call, 'movementType').movable?.movementType ?? 'PushPull'
        })
        .implement(SERVER, 'BlockMovableComponent', 'stickyType', {
            get: (call) => facts(call, 'stickyType').movable?.stickyType ?? 'None'
        })
        .implement(SERVER, 'BlockMapColorComponent', 'color', {
            get: (call) => color(facts(call, 'color').mapColorComponent?.color)
        })
        .implement(SERVER, 'BlockMapColorComponent', 'tintedColor', {
            get: (call) => color(facts(call, 'tintedColor').mapColorComponent?.tintedColor)
        })
        .implement(SERVER, 'BlockMapColorComponent', 'tintMethod', {
            get: (call) => facts(call, 'tintMethod').mapColorComponent?.tintMethod ?? 'None'
        })
        .implement(
            SERVER,
            'BlockPrecipitationInteractionsComponent',
            'accumulatesSnow',
            (call) => facts(call, 'accumulatesSnow').precipitation?.accumulatesSnow ?? false
        )
        .implement(
            SERVER,
            'BlockPrecipitationInteractionsComponent',
            'isSnowLoggable',
            (call) => facts(call, 'isSnowLoggable').precipitation?.isSnowLoggable ?? false
        )
        .implement(
            SERVER,
            'BlockPrecipitationInteractionsComponent',
            'obstructsRain',
            (call) => facts(call, 'obstructsRain').precipitation?.obstructsRain ?? false
        )
        .implement(
            SERVER,
            'BlockVibrationPropertiesComponent',
            'getCanDampenVibrations',
            (call) => facts(call, 'getCanDampenVibrations').vibration?.dampens ?? false
        )
        .implement(
            SERVER,
            'BlockVibrationPropertiesComponent',
            'getCanOccludeVibrations',
            (call) => facts(call, 'getCanOccludeVibrations').vibration?.occludes ?? false
        );
};
